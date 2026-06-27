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
  if (!isObject(data)) {
    return 'Smart import completed, but no readable response was returned.'
  }

  const message = getString(data.message) || getString(data.detail) || 'Smart import completed.'
  const imported = getNumber(data.imported)
  const rejected = getNumber(data.rejected)
  const detectedFileType = getString(data.detected_file_type)
  if (message !== 'Smart import completed.') {
  return message
}

  const lines = [message, `Imported: ${imported}`, `Rejected: ${rejected}`]

  if (detectedFileType) {
    lines.push(
      `Detected file type: ${
        detectedFileType === 'xlsx' ? 'Excel' : detectedFileType.toUpperCase()
      }`
    )
  }

  if (isObject(data.mapped_columns) && Object.keys(data.mapped_columns).length > 0) {
    lines.push('Mapped columns:')
    Object.entries(data.mapped_columns).forEach(([source, target]) => {
      lines.push(`${source} -> ${String(target)}`)
    })
  }

  if (
    Array.isArray(data.missing_required_fields) &&
    data.missing_required_fields.length > 0
  ) {
    lines.push(
      `Missing required fields: ${data.missing_required_fields.map(String).join(', ')}`
    )
  }

  if (Array.isArray(data.rejected_rows) && data.rejected_rows.length > 0) {
    lines.push('Some rows were not imported:')

    data.rejected_rows.forEach((item) => {
      if (!isObject(item)) return

      const row =
        item.row === null || item.row === undefined
          ? 'Unknown row'
          : `Row ${String(item.row)}`

      const reason = getString(item.reason) || 'No reason provided'
      lines.push(`${row}: ${reason}`)
    })
  }

  return lines.join('\n')
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

function renderTextLines(message: string) {
  return message.split('\n').map((line) => <p key={line}>{line}</p>)
}

function renderReconciliationMessage(message: unknown) {
  if (!message) return null

  if (typeof message === 'string') {
    return <p>{message}</p>
  }

  if (!isObject(message)) {
    return <p>Reconciliation completed.</p>
  }

  const results = Array.isArray(message.results) ? message.results : []
  const mismatches = Array.isArray(message.mismatches) ? message.mismatches : []

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
    <>
      <p>Reconciliation completed.</p>
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
    </>
  )
}

function renderDashboardMessage(message: unknown) {
  if (!message) return null

  if (typeof message === 'string') {
    return <p>{message}</p>
  }

  if (!isObject(message)) {
    return <p>Dashboard loaded.</p>
  }

  return (
    <>
      {'total_payments' in message && (
        <p>Total payments: {getNumber(message.total_payments)}</p>
      )}

      {'successful_payments' in message && (
        <p>Successful payments: {getNumber(message.successful_payments)}</p>
      )}

      {'failed_payments' in message && (
        <p>Failed payments: {getNumber(message.failed_payments)}</p>
      )}

      {('mismatches_found' in message || 'mismatch_count' in message) && (
        <p>
          Mismatches found:{' '}
          {getNumber(message.mismatches_found) || getNumber(message.mismatch_count)}
        </p>
      )}

      {'total_successful_amount' in message && (
        <p>
          Total successful amount: ₦
          {getNumber(message.total_successful_amount).toLocaleString()}
        </p>
      )}
    </>
  )
}

function App() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [token, setToken] = useState('')
  const [authMessage, setAuthMessage] = useState('')
  const [businessMessage, setBusinessMessage] = useState('')
  const [csvMessage, setCsvMessage] = useState('')

  const [reconciliationMessage, setReconciliationMessage] = useState<unknown>(null)
  const [dashboardMessage, setDashboardMessage] = useState<unknown>(null)
  const [exportMessage, setExportMessage] = useState('')

  const [loadingStates, setLoadingStates] = useState({
    register: false,
    login: false,
    createBusiness: false,
    uploadCsv: false,
    runReconciliation: false,
    viewDashboard: false,
    exportCsv: false,
  })

  const setActionLoading = (
    action: keyof typeof loadingStates,
    value: boolean
  ) => {
    setLoadingStates((current) => ({
      ...current,
      [action]: value,
    }))
  }

  const [businessName, setBusinessName] = useState('')
  const [category, setCategory] = useState('')
  const [location, setLocation] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [businessId, setBusinessId] = useState<number | null>(null)

  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [selectedProvider, setSelectedProvider] = useState('Paystack')

  async function registerUser() {
    setActionLoading('register', true)

    try {
      const response = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: fullName, email, password }),
      })

      const data = await response.json()
      setAuthMessage(getString(data.message) || 'User registered successfully.')
    } catch {
      setAuthMessage('Registration failed.')
    } finally {
      setActionLoading('register', false)
    }
  }

  async function loginUser() {
    setActionLoading('login', true)

    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = await response.json()

      if (data.access_token) {
        setToken(data.access_token)
        setAuthMessage('Logged in successfully.')
        return
      }

      setAuthMessage(getString(data.detail) || getString(data.message) || 'Login failed.')
    } catch {
      setAuthMessage('Login failed.')
    } finally {
      setActionLoading('login', false)
    }
  }

  async function createBusiness() {
    setActionLoading('createBusiness', true)

    try {
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
        setBusinessMessage(
          `${getString(data.message) || 'Business created successfully.'}\nActive Business ID: ${data.business_id}`
        )
        return
      }

      setBusinessMessage(
        getString(data.detail) || getString(data.message) || 'Business creation failed.'
      )
    } catch {
      setBusinessMessage('Business creation failed.')
    } finally {
      setActionLoading('createBusiness', false)
    }
  }

  async function uploadCsv() {
    if (!businessId) {
      setCsvMessage('Please create a business first.')
      return
    }

    if (!csvFile) {
      setCsvMessage('Please choose a CSV or Excel file first.')
      return
    }

    setActionLoading('uploadCsv', true)

    try {
      const formData = new FormData()
      formData.append('business_id', String(businessId))
      formData.append('file', csvFile)
      formData.append('provider', selectedProvider)

      const response = await fetch(`${API_URL}/csv/transactions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })

      const data = await response.json()
      setCsvMessage(getCsvUploadMessage(data))
    } catch {
      setCsvMessage('Smart import failed. Please try again.')
    } finally {
      setActionLoading('uploadCsv', false)
    }
  }

  async function runReconciliation() {
    if (!businessId) {
      setReconciliationMessage('Please create a business first.')
      return
    }

    setActionLoading('runReconciliation', true)

    try {
      const response = await fetch(
        `${API_URL}/reconciliation/run?business_id=${businessId}`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        }
      )

      const data = await response.json()
      setReconciliationMessage(data)
    } catch {
      setReconciliationMessage('Reconciliation failed. Please try again.')
    } finally {
      setActionLoading('runReconciliation', false)
    }
  }

  async function viewDashboard() {
    if (!businessId) {
      setDashboardMessage('Please create a business first.')
      return
    }

    setActionLoading('viewDashboard', true)

    try {
      const response = await fetch(
        `${API_URL}/dashboard/summary?business_id=${businessId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      )

      const data = await response.json()
      setDashboardMessage(data)
    } catch {
      setDashboardMessage('Dashboard failed to load. Please try again.')
    } finally {
      setActionLoading('viewDashboard', false)
    }
  }

  async function exportCsv() {
    if (!businessId) {
      setExportMessage('Please create a business first.')
      return
    }

    setActionLoading('exportCsv', true)

    try {
      const response = await fetch(
        `${API_URL}/export/transactions?business_id=${businessId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      )

      if (!response.ok) {
        setExportMessage('CSV export failed. Please try again.')
        return
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)

      const link = document.createElement('a')
      link.href = url
      link.download = 'settletrack-transactions.csv'
      link.click()

      window.URL.revokeObjectURL(url)
      setExportMessage('CSV exported successfully.')
    } catch {
      setExportMessage('CSV export failed. Please try again.')
    } finally {
      setActionLoading('exportCsv', false)
    }
  }

  return (
    <main className="app">
      <section className="hero">
        <h1>SettleTrack</h1>
        <p>Payment reconciliation and settlement reporting for SMEs.</p>
      </section>

      <section className="panel">
        <h2>1. Login</h2>

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
          <button disabled={loadingStates.register} onClick={registerUser}>
            {loadingStates.register ? 'Registering...' : 'Register'}
          </button>
          <button disabled={loadingStates.login} onClick={loginUser}>
            {loadingStates.login ? 'Logging in...' : 'Login'}
          </button>
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

        <button
          disabled={!token || loadingStates.createBusiness}
          onClick={createBusiness}
        >
          {loadingStates.createBusiness ? 'Creating business...' : 'Create Business'}
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
        <h2>3. Smart Import Transactions</h2>

        <p>
          Active Business:{' '}
          <strong>{businessId ? businessId : 'Create business first'}</strong>
        </p>

        <p>
          Upload CSV or Excel transaction file. SettleTrack will detect columns and
          import what it can.
        </p>

        <label>Provider</label>
        <select
          value={selectedProvider}
          onChange={(e) => setSelectedProvider(e.target.value)}
        >
          <option>Paystack</option>
          <option>Flutterwave</option>
          <option>Monnify</option>
          <option>Bank Statement</option>
          <option>Other</option>
        </select>

        <label>Transaction File</label>
        <input
          type="file"
          accept=".csv,.xlsx,.xls,.pdf,.png,.jpg,.jpeg"
          onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
        />

        <button
          disabled={!token || !businessId || loadingStates.uploadCsv}
          onClick={uploadCsv}
        >
          {loadingStates.uploadCsv ? 'Importing transactions...' : 'Import Transactions'}
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

        <div className="action-block">
          <button
            disabled={!token || !businessId || loadingStates.runReconciliation}
            onClick={runReconciliation}
          >
            {loadingStates.runReconciliation
              ? 'Running reconciliation...'
              : 'Run Reconciliation'}
          </button>

          {reconciliationMessage !== null && (
            <div className="local-result">
              {renderReconciliationMessage(reconciliationMessage)}
            </div>
          )}
        </div>

        <div className="action-block">
          <button
            disabled={!token || !businessId || loadingStates.viewDashboard}
            onClick={viewDashboard}
          >
            {loadingStates.viewDashboard ? 'Loading dashboard...' : 'View Dashboard'}
          </button>

          {dashboardMessage !== null && (
            <div className="local-result">
              {renderDashboardMessage(dashboardMessage)}
            </div>
          )}
        </div>

        <div className="action-block">
          <button
            disabled={!token || !businessId || loadingStates.exportCsv}
            onClick={exportCsv}
          >
            {loadingStates.exportCsv ? 'Exporting CSV...' : 'Export CSV'}
          </button>

          {exportMessage && (
            <div className="local-message">{renderTextLines(exportMessage)}</div>
          )}
        </div>
      </section>
    </main>
  )
}

export default App