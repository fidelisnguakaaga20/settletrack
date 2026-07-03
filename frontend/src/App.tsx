import { useState } from 'react'
import './App.css'

const API_URL = import.meta.env.VITE_API_URL

type ApiObject = Record<string, unknown>
type ActivePage =
  | 'dashboard'
  | 'business'
  | 'upload'
  | 'reconciliation'
  | 'reports'
  | 'settings'

type LastImport = {
  fileName: string
  provider: string
  imported: number
  rejected: number
  fileType: string
}

function isObject(value: unknown): value is ApiObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function getNumber(value: unknown): number {
  return typeof value === 'number' ? value : 0
}

function getString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function friendlyFileType(value: string): string {
  if (value === 'xlsx') return 'Excel'
  if (value === 'csv') return 'CSV'
  if (value === 'pdf') return 'PDF'
  if (['png', 'jpg', 'jpeg'].includes(value)) return 'Image'
  return value ? value.toUpperCase() : 'Unknown'
}

function friendlyStatementType(value: string): string {
  if (value === 'bank_statement') return 'Bank Statement'
  if (value === 'transaction_table') return 'Transaction Table'
  return value ? 'Unsupported' : ''
}

function friendlyFieldName(value: string): string {
  const labels: Record<string, string> = {
    transaction_reference: 'Reference',
    customer_identifier: 'Customer / narration',
    payment_date: 'Payment date',
    amount: 'Amount',
    provider: 'Provider',
    status: 'Status',
  }

  return labels[value] || value.split('_').join(' ')
}

function getCsvUploadResult(data: unknown) {
  if (!isObject(data)) {
    return {
      message: 'We could not read this file clearly.',
      imported: 0,
      rejected: 0,
      fileType: 'Unknown',
      detectedColumns: [] as { source: string; target: string }[],
    }
  }

  const message = getString(data.message) || 'We could not read this file clearly.'
  const imported = getNumber(data.imported)
  const rejected = getNumber(data.total_rejected_rows) || getNumber(data.rejected)
  const detectedFileType = getString(data.detected_file_type)
  const detectedStatementType = getString(data.detected_statement_type)
  const userGuidance = getString(data.user_guidance)
  const detectedColumns: { source: string; target: string }[] = []
  const lines = [message]

  if (detectedStatementType && detectedStatementType !== 'unsupported') {
    lines.push(`Statement type: ${friendlyStatementType(detectedStatementType)}`)
  }

  if (detectedFileType) {
    lines.push(`File type: ${friendlyFileType(detectedFileType)}`)
  }

  lines.push(`Imported transactions: ${imported}`)
  lines.push(`Rejected rows: ${rejected}`)

  if (userGuidance) {
    lines.push(userGuidance)
  }

  if (
    Array.isArray(data.missing_required_fields) &&
    data.missing_required_fields.length > 0
  ) {
    lines.push('What happened:')
    lines.push(
      `SettleTrack could not find: ${data.missing_required_fields
        .map((field) => friendlyFieldName(String(field)))
        .join(', ')}.`
    )
  }

  if (isObject(data.mapped_columns) && Object.keys(data.mapped_columns).length > 0) {
    Object.entries(data.mapped_columns).forEach(([source, target]) => {
      detectedColumns.push({
        source,
        target: friendlyFieldName(String(target)),
      })
    })
  }

  if (Array.isArray(data.rejected_rows) && data.rejected_rows.length > 0) {
    const visibleRejectedRows = data.rejected_rows.slice(0, 5)
    const remainingRejectedRows = Math.max(rejected - visibleRejectedRows.length, 0)

    lines.push('Some rows need attention:')

    visibleRejectedRows.forEach((item) => {
      if (!isObject(item)) return

      const row =
        item.row === null || item.row === undefined
          ? 'Unknown row'
          : `Row ${String(item.row)}`

      const reason = getString(item.reason) || 'Could not read this row'
      lines.push(`${row}: ${reason}`)
    })

    if (remainingRejectedRows > 0) {
      lines.push(`${remainingRejectedRows} more rows were rejected.`)
    }
  }

  return {
    message: lines.join('\n'),
    imported,
    rejected,
    fileType: friendlyFileType(detectedFileType),
    detectedColumns,
  }
}

function getResultType(item: unknown): string {
  if (!isObject(item)) return ''
  return (
    getString(item.result_type) ||
    getString(item.mismatch_type) ||
    getString(item.type)
  ).toUpperCase()
}

function getReason(item: unknown): string {
  if (!isObject(item)) return 'No reason provided'
  return getString(item.reason) || 'No reason provided'
}

function getReconciliationItems(message: unknown): unknown[] {
  if (!isObject(message)) return []

  const results = Array.isArray(message.results) ? message.results : []
  const mismatches = Array.isArray(message.mismatches) ? message.mismatches : []

  return [...results, ...mismatches]
}

function countMatchingTypes(items: unknown[], expected: string[]): number {
  return items.filter((item) => expected.includes(getResultType(item))).length
}

function getReconciliationStats(message: unknown) {
  const items = getReconciliationItems(message)

  return {
    matched: countMatchingTypes(items, ['MATCHED']),
    unmatched: countMatchingTypes(items, ['UNMATCHED']),
    amountMismatch: countMatchingTypes(items, ['AMOUNT_MISMATCH']),
    duplicateReference: countMatchingTypes(items, ['DUPLICATE', 'DUPLICATE_REFERENCE']),
    mismatchTotal: isObject(message) && Array.isArray(message.mismatches)
      ? message.mismatches.length
      : countMatchingTypes(items, [
          'UNMATCHED',
          'AMOUNT_MISMATCH',
          'DUPLICATE',
          'DUPLICATE_REFERENCE',
          'SETTLEMENT_PENDING',
        ]),
  }
}

function getDashboardTotalTransactions(
  dashboardMessage: unknown,
  lastImports: LastImport[]
) {
  if (isObject(dashboardMessage)) {
    return (
      getNumber(dashboardMessage.total_transactions) ||
      getNumber(dashboardMessage.total_payments) ||
      getNumber(dashboardMessage.transactions_imported)
    )
  }

  return lastImports.reduce((total, item) => total + item.imported, 0)
}

function renderTextLines(message: string) {
  return message.split('\n').map((line, index) => <p key={`${line}-${index}`}>{line}</p>)
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
  const [activePage, setActivePage] = useState<ActivePage>('dashboard')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [token, setToken] = useState('')
  const [authMessage, setAuthMessage] = useState('')
  const [businessMessage, setBusinessMessage] = useState('')
  const [csvMessage, setCsvMessage] = useState('')
  const [exportMessage, setExportMessage] = useState('')
  const [lastReconciliationDate, setLastReconciliationDate] = useState('Not run yet')
  const [lastImports, setLastImports] = useState<LastImport[]>([])
  const [detectedColumns, setDetectedColumns] = useState<
    { source: string; target: string }[]
  >([])
  const [showDetectedColumns, setShowDetectedColumns] = useState(false)

  const [reconciliationMessage, setReconciliationMessage] = useState<unknown>(null)
  const [dashboardMessage, setDashboardMessage] = useState<unknown>(null)

  const [loadingStates, setLoadingStates] = useState({
    register: false,
    login: false,
    createBusiness: false,
    uploadCsv: false,
    runReconciliation: false,
    viewDashboard: false,
    exportCsv: false,
  })

  const [businessName, setBusinessName] = useState('')
  const [category, setCategory] = useState('')
  const [location, setLocation] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [businessId, setBusinessId] = useState<number | null>(null)

  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [selectedProvider, setSelectedProvider] = useState('Paystack')

  const setActionLoading = (
    action: keyof typeof loadingStates,
    value: boolean
  ) => {
    setLoadingStates((current) => ({
      ...current,
      [action]: value,
    }))
  }

  async function registerUser() {
    if (!fullName.trim() || !email.trim() || !password.trim()) {
      setAuthMessage('Please enter full name, email, and password.')
      return
    }

    setActionLoading('register', true)

    try {
      const response = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: fullName, email, password }),
      })

      const data = await response.json()

      if (!response.ok) {
        setAuthMessage(getString(data.detail) || getString(data.message) || 'Registration failed.')
        return
      }

      setAuthMessage(getString(data.message) || 'User registered successfully.')
    } catch {
      setAuthMessage('Registration failed.')
    } finally {
      setActionLoading('register', false)
    }
  }

  async function loginUser() {
    if (!email.trim() || !password.trim()) {
      setAuthMessage('Please enter email and password.')
      return
    }

    setActionLoading('login', true)

    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = await response.json()

      if (!response.ok) {
        setAuthMessage(getString(data.detail) || getString(data.message) || 'Login failed.')
        return
      }

      if (data.access_token) {
        setToken(data.access_token)
        setAuthMessage('Logged in successfully.')
        resetWorkspaceState()
        setActivePage('dashboard')
        return
      }

      setAuthMessage('Login failed.')
    } catch {
      setAuthMessage('Login failed.')
    } finally {
      setActionLoading('login', false)
    }
  }

  function resetWorkspaceState() {
    setBusinessMessage('')
    setCsvMessage('')
    setExportMessage('')
    setBusinessName('')
    setCategory('')
    setLocation('')
    setContactEmail('')
    setContactPhone('')
    setBusinessId(null)
    setCsvFile(null)
    setSelectedProvider('Paystack')
    setLastImports([])
    setDetectedColumns([])
    setShowDetectedColumns(false)
    setReconciliationMessage(null)
    setDashboardMessage(null)
    setLastReconciliationDate('Not run yet')
  }

  function logoutUser() {
    setToken('')
    setPassword('')
    setShowPassword(false)
    setAuthMessage('')
    resetWorkspaceState()
    setActivePage('dashboard')
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
        setActivePage('dashboard')
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

    setCsvMessage('')
    setDetectedColumns([])
    setShowDetectedColumns(false)
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
      const result = getCsvUploadResult(data)

      setCsvMessage(result.message)
      setDetectedColumns(result.detectedColumns)
      setLastImports((current) =>
        [
          {
            fileName: csvFile.name,
            provider: selectedProvider,
            imported: result.imported,
            rejected: result.rejected,
            fileType: result.fileType,
          },
          ...current,
        ].slice(0, 5)
      )
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
      setLastReconciliationDate(new Date().toLocaleString())
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

  const reconciliationStats = getReconciliationStats(reconciliationMessage)
  const totalTransactions = getDashboardTotalTransactions(dashboardMessage, lastImports)

  if (!token) {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <div className="brand-mark">ST</div>
          <h1>SettleTrack</h1>
          <p>
            Payment reconciliation and settlement reporting for Nigerian SMEs.
          </p>

          <div className="auth-form">
            <label>Full Name</label>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} />

            <label>Email</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} />

            <label>Password</label>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type={showPassword ? 'text' : 'password'}
            />

            <button
              className="secondary-button password-toggle"
              type="button"
              onClick={() => setShowPassword((current) => !current)}
            >
              {showPassword ? 'Hide Password' : 'Show Password'}
            </button>

            <div className="actions">
              <button disabled={loadingStates.register} onClick={registerUser}>
                {loadingStates.register ? 'Registering...' : 'Register'}
              </button>
              <button disabled={loadingStates.login} onClick={loginUser}>
                {loadingStates.login ? 'Logging in...' : 'Login'}
              </button>
            </div>

            {authMessage && <p className="success local-feedback">{authMessage}</p>}
          </div>
        </section>
      </main>
    )
  }

  function renderDashboardPage() {
    return (
      <section className="page-section">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Overview</p>
            <h1>Dashboard</h1>
            <p>Find missing, duplicate, and mismatched payments without manual Excel checking.</p>
          </div>
          <button disabled={loadingStates.viewDashboard} onClick={viewDashboard}>
            {loadingStates.viewDashboard ? 'Refreshing...' : 'Refresh dashboard'}
          </button>
        </div>

        {businessMessage && (
          <div className="success local-feedback">
            {renderTextLines(businessMessage)}
          </div>
        )}

        {!businessId && totalTransactions === 0 && lastReconciliationDate === 'Not run yet' && (
          <div className="clarity-card">
            <h2>Welcome to SettleTrack.</h2>
            <p>
              Use SettleTrack to upload your payment records, run reconciliation,
              and find missing, duplicate, or mismatched payments.
            </p>
            <p>Start by creating a business, then upload transactions.</p>
          </div>
        )}

        <div className="clarity-card">
          <h2>Getting started</h2>
          <div className="step-grid">
            <div><strong>1. Create your business profile</strong><span>Add the business you want to reconcile.</span></div>
            <div><strong>2. Upload transaction records</strong><span>Import payment records from CSV, Excel, or bank statements.</span></div>
            <div><strong>3. Run reconciliation</strong><span>Find missing, duplicate, and mismatched payments.</span></div>
            <div><strong>4. Export your report</strong><span>Download a clean CSV for review or accounting.</span></div>
          </div>
        </div>

        <div className="clarity-card">
          <h2>What SettleTrack does</h2>
          <p><strong>Find missing, duplicate, and mismatched payments</strong> before they affect your business reports.</p>
          <ul className="clarity-list">
            <li>Missing payments</li>
            <li>Duplicate transactions</li>
            <li>Amount mismatches</li>
            <li>Unmatched records</li>
            <li>Settlement/reporting issues</li>
          </ul>
        </div>

        <div className="demo-flow">
          <h2>Recommended demo flow</h2>
          <ol>
            <li>Create a business</li>
            <li>Upload the sample transaction file</li>
            <li>Run reconciliation</li>
            <li>Export CSV report</li>
          </ol>
        </div>

        <div className="use-case-card">
          <h2>Example use case</h2>
          <p>
            A school receives many fee payments from parents. At the end of the day, the school uploads payment records into SettleTrack. SettleTrack helps identify duplicate payments, missing records, and amount mismatches before reports are sent to accounting.
          </p>
        </div>

        <div className="summary-grid">
          <div className="summary-card">
            <span>Total transactions imported</span>
            <strong>{totalTransactions}</strong>
          </div>
          <div className="summary-card">
            <span>Last reconciliation date</span>
            <strong>{lastReconciliationDate}</strong>
          </div>
          <div className="summary-card">
            <span>Mismatches found</span>
            <strong>{reconciliationStats.mismatchTotal}</strong>
          </div>
          <div className="summary-card">
            <span>Duplicates found</span>
            <strong>{reconciliationStats.duplicateReference}</strong>
          </div>
          <div className="summary-card">
            <span>Unmatched transactions</span>
            <strong>{reconciliationStats.unmatched}</strong>
          </div>
        </div>

        <div className="quick-actions">
          <button onClick={() => setActivePage('upload')}>Upload transactions</button>
          <button onClick={() => setActivePage('reconciliation')}>Run reconciliation</button>
          <button onClick={() => setActivePage('reports')}>View reports</button>
        </div>

        {dashboardMessage !== null && (
          <div className="local-result">
            {renderDashboardMessage(dashboardMessage)}
          </div>
        )}
      </section>
    )
  }

  function renderBusinessPage() {
    return (
      <section className="page-section narrow-page">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Business profile</p>
            <h1>Business Setup</h1>
            <p>Add the business details used for imports and reports.</p>
          </div>
        </div>

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

        <button disabled={loadingStates.createBusiness} onClick={createBusiness}>
          {loadingStates.createBusiness ? 'Saving business...' : 'Create / Save Business'}
        </button>

        {businessMessage && (
          <div className="success local-feedback">
            {renderTextLines(businessMessage)}
          </div>
        )}
      </section>
    )
  }

  function renderUploadPage() {
    return (
      <section className="page-section">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Smart import</p>
            <h1>Upload Transactions</h1>
            <p>
              Upload your transaction record from a provider, bank statement, or spreadsheet.
              SettleTrack will import the records and prepare them for reconciliation.
            </p>
          </div>
        </div>

        <div className="form-card">
          <p>
            Active Business:{' '}
            <strong>{businessId ? businessId : 'Create business first'}</strong>
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
            disabled={!businessId || loadingStates.uploadCsv}
            onClick={uploadCsv}
          >
            {loadingStates.uploadCsv ? 'Importing transactions...' : 'Import Transactions'}
          </button>

          {csvMessage && (
            <div className="success local-feedback">
              {renderTextLines(csvMessage)}
            </div>
          )}

          {detectedColumns.length > 0 && (
            <div className="detected-columns">
              <button
                className="secondary-button"
                type="button"
                onClick={() => setShowDetectedColumns((current) => !current)}
              >
                {showDetectedColumns ? 'Hide detected columns' : 'View detected columns'}
              </button>

              {showDetectedColumns && (
                <div className="small-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>File column</th>
                        <th>Matched as</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detectedColumns.map((column) => (
                        <tr key={`${column.source}-${column.target}`}>
                          <td>{column.source}</td>
                          <td>{column.target}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="page-subsection">
          <h2>Last 5 imports</h2>
          {lastImports.length === 0 ? (
            <p className="muted">No imports yet.</p>
          ) : (
            <div className="small-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Provider</th>
                    <th>Imported</th>
                    <th>Rejected</th>
                  </tr>
                </thead>
                <tbody>
                  {lastImports.map((item) => (
                    <tr key={`${item.fileName}-${item.provider}`}>
                      <td>{item.fileName}</td>
                      <td>{item.provider}</td>
                      <td>{item.imported}</td>
                      <td>{item.rejected}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    )
  }

  function renderReconciliationPage() {
    const items = getReconciliationItems(reconciliationMessage)
    const issueItems = items.filter((item) => getResultType(item) !== 'MATCHED').slice(0, 10)

    return (
      <section className="page-section">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Match and resolve</p>
            <h1>Reconciliation</h1>
            <p>
              Run reconciliation to compare your payment records and find missing,
              duplicate, and mismatched payments.
            </p>
          </div>

          <button
            disabled={!businessId || loadingStates.runReconciliation}
            onClick={runReconciliation}
          >
            {loadingStates.runReconciliation
              ? 'Running reconciliation...'
              : 'Run Reconciliation'}
          </button>
        </div>

        <div className="summary-grid four">
          <div className="summary-card">
            <span>Matched</span>
            <strong>{reconciliationStats.matched}</strong>
          </div>
          <div className="summary-card">
            <span>Unmatched</span>
            <strong>{reconciliationStats.unmatched}</strong>
          </div>
          <div className="summary-card">
            <span>Amount mismatch</span>
            <strong>{reconciliationStats.amountMismatch}</strong>
          </div>
          <div className="summary-card">
            <span>Duplicate reference</span>
            <strong>{reconciliationStats.duplicateReference}</strong>
          </div>
        </div>

        {typeof reconciliationMessage === 'string' && (
          <div className="local-result">{renderTextLines(reconciliationMessage)}</div>
        )}

        <div className="page-subsection">
          <div className="subsection-header">
            <h2>Mismatch list</h2>
            <button
              disabled={!businessId || loadingStates.exportCsv}
              onClick={exportCsv}
            >
              {loadingStates.exportCsv ? 'Downloading...' : 'Download CSV'}
            </button>
          </div>

          <div className="explanation-box">
            <p><strong>Matched means</strong> the payment record looks correct.</p>
            <p><strong>Unmatched means</strong> SettleTrack could not find a matching record.</p>
            <p><strong>Amount mismatch means</strong> the reference exists but the amount is different.</p>
            <p><strong>Duplicate reference means</strong> the same payment reference appears more than once.</p>
          </div>

          {issueItems.length === 0 ? (
            <p className="muted">No issues found in the current reconciliation result.</p>
          ) : (
            <div className="small-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Issue type</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {issueItems.map((item, index) => (
                    <tr key={`${getResultType(item)}-${index}`}>
                      <td>{friendlyFieldName(getResultType(item).toLowerCase())}</td>
                      <td>{getReason(item)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {exportMessage && (
            <div className="local-message">{renderTextLines(exportMessage)}</div>
          )}
        </div>
      </section>
    )
  }

  function renderReportsPage() {
    return (
      <section className="page-section narrow-page">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Reports</p>
            <h1>Reports / Export</h1>
            <p>Export a clean CSV report for review, audit, or accounting.</p>
          </div>
        </div>

        <div className="report-list">
          <div className="report-card">
            <div>
              <h2>Export CSV</h2>
              <p>Download the working transaction export.</p>
            </div>
            <button disabled={!businessId || loadingStates.exportCsv} onClick={exportCsv}>
              {loadingStates.exportCsv ? 'Exporting...' : 'Export CSV'}
            </button>
          </div>

          <div className="report-card muted-card">
            <div>
              <h2>Export mismatch report</h2>
              <p>Coming later. Not connected to a backend endpoint yet.</p>
            </div>
            <button disabled>Unavailable</button>
          </div>

          <div className="report-card muted-card">
            <div>
              <h2>Export summary report</h2>
              <p>Coming later. Not connected to a backend endpoint yet.</p>
            </div>
            <button disabled>Unavailable</button>
          </div>
        </div>

        {exportMessage && (
          <div className="local-message">{renderTextLines(exportMessage)}</div>
        )}
      </section>
    )
  }

  function renderSettingsPage() {
    return (
      <section className="page-section narrow-page">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Settings</p>
            <h1>Account & Business Information</h1>
            <p>Simple profile information for the current workspace.</p>
          </div>
        </div>

        <div className="info-card">
          <h2>Account information</h2>
          <p><strong>Name:</strong> {fullName || 'Not provided'}</p>
          <p><strong>Email:</strong> {email || 'Not provided'}</p>
        </div>

        <div className="info-card">
          <h2>Business information</h2>
          <p><strong>Business:</strong> {businessName || 'Not provided'}</p>
          <p><strong>Business ID:</strong> {businessId || 'Not created yet'}</p>
          <p><strong>Category:</strong> {category || 'Not provided'}</p>
          <p><strong>Location:</strong> {location || 'Not provided'}</p>
          <p><strong>Contact email:</strong> {contactEmail || 'Not provided'}</p>
          <p><strong>Contact phone:</strong> {contactPhone || 'Not provided'}</p>
        </div>
      </section>
    )
  }

  function renderActivePage() {
    if (activePage === 'business') return renderBusinessPage()
    if (activePage === 'upload') return renderUploadPage()
    if (activePage === 'reconciliation') return renderReconciliationPage()
    if (activePage === 'reports') return renderReportsPage()
    if (activePage === 'settings') return renderSettingsPage()
    return renderDashboardPage()
  }

  const navigationItems: { key: ActivePage; label: string }[] = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'business', label: 'Business Setup' },
    { key: 'upload', label: 'Upload Transactions' },
    { key: 'reconciliation', label: 'Reconciliation' },
    { key: 'reports', label: 'Reports / Export' },
    { key: 'settings', label: 'Settings' },
  ]

  return (
    <main className="dashboard-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark">ST</div>
          <div>
            <strong>SettleTrack</strong>
            <span>SME reconciliation</span>
          </div>
        </div>

        <nav>
          {navigationItems.map((item) => (
            <button
              key={item.key}
              className={activePage === item.key ? 'nav-button active' : 'nav-button'}
              onClick={() => setActivePage(item.key)}
            >
              {item.label}
            </button>
          ))}
          <button className="nav-button logout-button" onClick={logoutUser}>
            Logout
          </button>
        </nav>
      </aside>

      <section className="main-area">
        <header className="topbar">
          <div>
            <span className="muted">Active business</span>
            <strong>{businessName || (businessId ? `Business ${businessId}` : 'Not set')}</strong>
          </div>
          <div>
            <span className="muted">Signed in as</span>
            <strong>{email}</strong>
          </div>
        </header>

        {renderActivePage()}
      </section>
    </main>
  )
}

export default App
