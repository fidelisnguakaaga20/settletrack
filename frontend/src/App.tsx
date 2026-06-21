import { useState } from 'react'
import './App.css'

const API_URL = import.meta.env.VITE_API_URL

type ApiObject = Record<string, unknown>

function isObject(value: unknown): value is ApiObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function getNumber(value: unknown): number {
  return typeof value === 'number' ? value : 0
}

function getString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function getCsvUploadMessage(data: unknown): string {
  if (!data || typeof data !== 'object') {
    return 'CSV upload completed, but no readable response was returned.'
  }

  const record = data as Record<string, unknown>

  const imported =
    typeof record.imported === 'number'
      ? record.imported
      : typeof record.imported_count === 'number'
        ? record.imported_count
        : typeof record.transactions_imported === 'number'
          ? record.transactions_imported
          : null

  const message =
    typeof record.message === 'string'
      ? record.message
      : typeof record.detail === 'string'
        ? record.detail
        : ''

  const missingColumns = Array.isArray(record.missing_columns)
    ? record.missing_columns.map(String)
    : Array.isArray(record.missingColumns)
      ? record.missingColumns.map(String)
      : []

  const errors = Array.isArray(record.errors)
    ? record.errors.map(String)
    : Array.isArray(record.error)
      ? record.error.map(String)
      : []

  if (missingColumns.length > 0) {
    return `No transactions were imported.\nMissing columns: ${missingColumns.join(', ')}`
  }

  const missingFromErrors = errors.filter((item) =>
    item.toLowerCase().includes('missing')
  )

  if (missingFromErrors.length > 0) {
    return `No transactions were imported.\n${missingFromErrors.join('\n')}`
  }

  if (imported === 0) {
    return message || 'No transactions were imported.'
  }

  if (typeof imported === 'number') {
    return `Imported ${imported} transactions successfully.`
  }

  return message || 'CSV upload completed.'
}

function pluralize(count: number, word: string) {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

function countByReason(items: unknown[]): Record<string, number> {
  return items.reduce<Record<string, number>>((acc, item) => {
    if (!isObject(item)) return acc

    const reason = getString(item.reason) || 'No reason provided'
    acc[reason] = (acc[reason] || 0) + 1

    return acc
  }, {})
}

function countByType(items: unknown[], key: string, expected: string): number {
  return items.filter((item) => {
    if (!isObject(item)) return false
    return getString(item[key]).toUpperCase() === expected
  }).length
}

function renderFriendlyResponse(response: unknown) {
  if (!response) {
    return <p className="response-line muted">No response yet.</p>
  }

  if (typeof response === 'string') {
    return <p className="response-line">{response}</p>
  }

  if (!isObject(response)) {
    return <p className="response-line">Action completed.</p>
  }

  if ('access_token' in response) {
    return <p className="response-line success">Logged in successfully.</p>
  }

  if ('imported' in response || 'errors' in response) {
    const imported = getNumber(response.imported)
    const errors = Array.isArray(response.errors) ? response.errors : []
    const failedRows = getNumber(response.failed_rows)

    return (
      <div className="response-summary">
        {imported === 0 && errors.length > 0 ? (
          <>
            <p className="response-line error">No transactions were imported.</p>
            <p className="response-line">{errors.map(String).join(', ')}</p>
          </>
        ) : (
          <p className="response-line success">
            Imported {imported} transactions successfully.
          </p>
        )}

        {failedRows > 0 && (
          <p className="response-line warning">
            {pluralize(failedRows, 'row')} had issues.
          </p>
        )}
      </div>
    )
  }

  const hasDashboardFields =
    'total_payments' in response ||
    'successful_payments' in response ||
    'failed_payments' in response ||
    'mismatches_found' in response ||
    'mismatch_count' in response ||
    'total_successful_amount' in response

  if (hasDashboardFields) {
    return (
      <div className="response-grid">
        <p>Total payments: {getNumber(response.total_payments)}</p>
        <p>Successful payments: {getNumber(response.successful_payments)}</p>
        <p>Failed payments: {getNumber(response.failed_payments)}</p>
        <p>
          Mismatches found:{' '}
          {getNumber(response.mismatches_found) || getNumber(response.mismatch_count)}
        </p>
        <p>
          Total successful amount: ₦
          {getNumber(response.total_successful_amount).toLocaleString()}
        </p>
      </div>
    )
  }

  const results = Array.isArray(response.results) ? response.results : []
  const mismatches = Array.isArray(response.mismatches)
    ? response.mismatches
    : []

  if (results.length > 0 || mismatches.length > 0) {
    const unmatchedCount =
      countByType(results, 'result_type', 'UNMATCHED') +
      countByType(mismatches, 'mismatch_type', 'UNMATCHED')

    const duplicateCount =
      countByType(results, 'result_type', 'DUPLICATE') +
      countByType(mismatches, 'mismatch_type', 'DUPLICATE')

    const amountMismatchCount =
      countByType(results, 'result_type', 'AMOUNT_MISMATCH') +
      countByType(mismatches, 'mismatch_type', 'AMOUNT_MISMATCH')

    const settlementPendingCount =
      countByType(results, 'result_type', 'SETTLEMENT_PENDING') +
      countByType(mismatches, 'mismatch_type', 'SETTLEMENT_PENDING')

    const reasonCounts = countByReason([...results, ...mismatches])

    return (
      <div className="response-summary">
        <p className="response-line success">Reconciliation completed.</p>
        <p>Unmatched transactions: {unmatchedCount}</p>
        <p>Mismatches found: {mismatches.length}</p>
        <p>Duplicates detected: {duplicateCount}</p>
        <p>Amount mismatches: {amountMismatchCount}</p>
        <p>Settlement pending: {settlementPendingCount}</p>

        {Object.keys(reasonCounts).length > 0 && (
          <div className="reason-list">
            <strong>Reasons</strong>
            {Object.entries(reasonCounts).map(([reason, count]) => (
              <p key={reason}>
                {reason}: {pluralize(count, 'transaction')}
              </p>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="response-summary">
      {'message' in response && (
        <p className="response-line success">{getString(response.message)}</p>
      )}

      {'business_id' in response && (
        <p className="response-line">
          Active Business ID: {getNumber(response.business_id)}
        </p>
      )}

      {!('message' in response) && !('business_id' in response) && (
        <p className="response-line">Action completed.</p>
      )}
    </div>
  )
}

function App() {
  const [fullName, setFullName] = useState('Enter Full Name')
  const [email, setEmail] = useState('Enter Your Email')
  const [password, setPassword] = useState('testpassword123')
  const [token, setToken] = useState('')
  const [authMessage, setAuthMessage] = useState('')
  const [businessMessage, setBusinessMessage] = useState('')
  const [csvMessage, setCsvMessage] = useState('')
  const [responseData, setResponseData] = useState<unknown>(null)

  const [businessName, setBusinessName] = useState('Enter Name of Business')
  const [category, setCategory] = useState('Enter Category E.g Food, Retail, Pharmacy')
  const [location, setLocation] = useState('Enter Your City')
  const [contactEmail, setContactEmail] = useState('Enter Contact Email')
  const [contactPhone, setContactPhone] = useState('Enter Contact Phone')
  const [businessId, setBusinessId] = useState<number | null>(null)

  const [csvFile, setCsvFile] = useState<File | null>(null)

  function show(data: unknown) {
    setResponseData(data)
  }

  async function registerUser() {
  const response = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ full_name: fullName, email, password }),
  })

  const data = await response.json()
  setAuthMessage(getString(data.message) || 'User registered successfully')
}

  async function loginUser() {
    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })

    const data = await response.json()

    if (data.access_token) {
      setToken(data.access_token)
    }

    setAuthMessage('Logged in successfully.')
  }

  async function createBusiness() {
    const response = await fetch(`${API_URL}/businesses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: businessName,
        category,
        location,
        contact_email: contactEmail,
        contact_phone: contactPhone,
      }),
    })

    const data = await response.json()

    if (data.business_id) {
      setBusinessId(data.business_id)
    }

  setBusinessMessage(
    `${getString(data.message) || 'Business created successfully.'}\nActive Business ID: ${data.business_id}`
  )
  }

  async function uploadCsv() {
    if (!businessId) {
      setCsvMessage('Please create a business first.')
      return
    }

    if (!csvFile) {
      setCsvMessage('Please choose a CSV file first.')
      return
    }

    const formData = new FormData()
    formData.append('business_id', String(businessId))
    formData.append('file', csvFile)

    const response = await fetch(`${API_URL}/csv/transactions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    })

  const data = await response.json()
    setCsvMessage(getCsvUploadMessage(data))
  }

  async function runReconciliation() {
    if (!businessId) {
      show('Please create a business first.')
      return
    }

    const response = await fetch(
      `${API_URL}/reconciliation/run?business_id=${businessId}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }
    )

    show(await response.json())
  }

  async function viewDashboard() {
    if (!businessId) {
      show('Please create a business first.')
      return
    }

    const response = await fetch(
      `${API_URL}/dashboard/summary?business_id=${businessId}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    )

    show(await response.json())
  }

  async function exportCsv() {
    if (!businessId) {
      show('Please create a business first.')
      return
    }

    const response = await fetch(
      `${API_URL}/export/transactions?business_id=${businessId}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    )

    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)

    const link = document.createElement('a')
    link.href = url
    link.download = 'settletrack-transactions.csv'
    link.click()

    window.URL.revokeObjectURL(url)
  }

  return (
    <main className="app">
      <section className="hero">
        <h1>SettleTrack</h1>
        <p>Payment reconciliation and settlement reporting for SMEs.</p>
      </section>

      <section className="panel">
        <h2>1. Login </h2>

        <label>Full Name</label>
        <input value={fullName} onChange={(e) => setFullName(e.target.value)} />

        <label>Email</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)} />

        <label>Password</label>
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
        />

        <div className="actions">
          <button onClick={registerUser}>Register</button>
          <button onClick={loginUser}>Login</button>
        </div>

        {authMessage && <p className="success local-feedback">{authMessage}</p>}
      </section>

      <section className="panel">
        <h2>2. Create Business</h2>

        <label>Business Name</label>
        <input
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
        />

        <label>Category</label>
        <input value={category} onChange={(e) => setCategory(e.target.value)} />

        <label>Location</label>
        <input value={location} onChange={(e) => setLocation(e.target.value)} />

        <label>Contact Email</label>
        <input
          value={contactEmail}
          onChange={(e) => setContactEmail(e.target.value)}
        />

        <label>Contact Phone</label>
        <input
          value={contactPhone}
          onChange={(e) => setContactPhone(e.target.value)}
        />

        <button disabled={!token} onClick={createBusiness}>
          Create Business
        </button>

        {businessMessage && (
          <div className="success local-feedback">
            {businessMessage.split('\n').map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <h2>3. Upload CSV</h2>

        <p>
          Active Business:{' '}
          <strong>{businessId ? businessId : 'Create business first'}</strong>
        </p>

        <label>CSV File</label>
        <input
          type="file"
          accept=".csv"
          onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
        />

        <button disabled={!token || !businessId} onClick={uploadCsv}>
          Upload CSV
        </button>

        {csvMessage && (
          <div className="success local-feedback">
            {csvMessage.split('\n').map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        )}
        </section>

      <section className="panel">
        <h2>4. Pilot Actions</h2>

        <div className="actions">
          <button disabled={!token || !businessId} onClick={runReconciliation}>
            Run Reconciliation
          </button>
          <button disabled={!token || !businessId} onClick={viewDashboard}>
            View Dashboard
          </button>
          <button disabled={!token || !businessId} onClick={exportCsv}>
            Export CSV
          </button>
        </div>
      </section>

      <section className="panel response-panel">
        <h2>Response</h2>

        <div className="friendly-response">
          {renderFriendlyResponse(responseData)}
        </div>
      </section>
    </main>
  )
}

export default App