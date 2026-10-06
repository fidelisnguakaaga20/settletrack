import { useEffect, useRef, useState } from 'react'
import './App.css'

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string
            callback: (response: { credential: string }) => void
          }) => void
          renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void
        }
      }
    }
  }
}

const API_URL = import.meta.env.VITE_API_URL
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID
const WHATSAPP_SUPPORT_URL =
  'https://wa.me/2347031128081?text=' +
  encodeURIComponent('Hi, I need help with SettleTrack.')

type ApiObject = Record<string, unknown>
type ActivePage =
  | 'dashboard'
  | 'business'
  | 'upload'
  | 'reconciliation'
  | 'reports'
  | 'settings'
  | 'feedback'
  | 'pricing'
  | 'admin'

type LastImport = {
  fileName: string
  provider: string
  imported: number
  rejected: number
  fileType: string
  batchId: string | null
}

type BusinessSummary = {
  id: number
  name: string
  category: string
  location: string
  contactEmail: string
  contactPhone: string
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

function getErrorMessage(data: unknown, fallback: string): string {
  if (!isObject(data)) return fallback

  if (typeof data.detail === 'string') return data.detail
  if (typeof data.message === 'string') return data.message

  // FastAPI validation errors send `detail` as an array of {loc, msg} objects,
  // not a string - without this, every validation failure (weak password,
  // invalid email, blank required field) showed only a generic fallback.
  if (Array.isArray(data.detail)) {
    const messages = data.detail
      .map((item) => {
        if (!isObject(item)) return ''
        const loc = Array.isArray(item.loc) ? item.loc : []
        const field = String(loc[loc.length - 1] ?? '')
        const msg = getString(item.msg)
        if (!msg) return ''
        return field && field !== 'body' ? `${field}: ${msg}` : msg
      })
      .filter(Boolean)

    if (messages.length > 0) return messages.join('; ')
  }

  return fallback
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
      batchId: null as string | null,
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
    batchId: typeof data.import_batch_id === 'string' ? data.import_batch_id : null,
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

function getReference(item: unknown): string {
  if (!isObject(item)) return ''
  return getString(item.transaction_reference)
}

function getReconciliationItems(message: unknown): unknown[] {
  if (!isObject(message)) return []

  const results = Array.isArray(message.results) ? message.results : []
  const mismatches = Array.isArray(message.mismatches) ? message.mismatches : []

  return mismatches.length > 0 ? mismatches : results
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
    failedPayment: countMatchingTypes(items, ['FAILED_PAYMENT', 'FAILED', 'FAIL']),
    mismatchTotal: isObject(message) && Array.isArray(message.mismatches)
      ? message.mismatches.length
      : countMatchingTypes(items, [
          'UNMATCHED',
          'AMOUNT_MISMATCH',
          'DUPLICATE',
          'DUPLICATE_REFERENCE',
          'FAILED_PAYMENT',
          'FAILED',
          'FAIL',
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

function Spinner() {
  return (
    <svg className="spinner" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <circle className="spinner-track" cx="12" cy="12" r="9" fill="none" strokeWidth="3" />
      <circle className="spinner-head" cx="12" cy="12" r="9" fill="none" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

function LoadingLabel({ text }: { text: string }) {
  return (
    <span className="loading-label">
      <Spinner />
      Please wait{text ? ` — ${text}` : ''}…
    </span>
  )
}

type ToastItem = { id: number; message: string; type: 'success' | 'error' }

function WhatsAppSupportButton() {
  return (
    <a
      className="whatsapp-float-button"
      href={WHATSAPP_SUPPORT_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with SettleTrack support on WhatsApp"
      title="Chat with us on WhatsApp"
    >
      <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden="true">
        <path d="M12.04 2c-5.52 0-10 4.48-10 10 0 1.77.46 3.45 1.26 4.9L2 22l5.25-1.26A9.96 9.96 0 0 0 12.04 22c5.52 0 10-4.48 10-10s-4.48-10-10-10Zm0 18.2c-1.56 0-3.02-.43-4.27-1.18l-.3-.18-3.12.75.76-3.04-.2-.31A8.17 8.17 0 0 1 3.84 12c0-4.53 3.68-8.2 8.2-8.2 4.53 0 8.2 3.67 8.2 8.2 0 4.53-3.67 8.2-8.2 8.2Zm4.5-6.14c-.25-.12-1.46-.72-1.68-.8-.23-.08-.39-.12-.56.12-.17.25-.64.8-.78.96-.14.17-.29.19-.53.06-.25-.12-1.05-.39-2-1.23-.74-.66-1.24-1.47-1.38-1.72-.15-.25-.02-.38.11-.5.11-.11.25-.29.37-.43.12-.14.16-.25.24-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.35-.77-1.85-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.23.25-.86.84-.86 2.04 0 1.2.88 2.37 1 2.53.12.17 1.74 2.65 4.21 3.72.59.25 1.05.4 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.46-.6 1.66-1.17.21-.58.21-1.08.15-1.18-.06-.1-.23-.16-.48-.28Z" />
      </svg>
    </a>
  )
}

function ToastStack({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: number) => void }) {
  if (toasts.length === 0) return null

  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.type}`}>
          <span>{toast.message}</span>
          <button
            type="button"
            className="toast-dismiss"
            onClick={() => onDismiss(toast.id)}
            aria-label="Dismiss notification"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}

function PasswordEyeToggle({ visible, onToggle }: { visible: boolean; onToggle: () => void }) {
  return (
    <button
      className="password-eye-toggle"
      type="button"
      onClick={onToggle}
      aria-label={visible ? 'Hide password' : 'Show password'}
      aria-pressed={visible}
    >
      {visible ? (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )}
    </button>
  )
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

function readStoredSession() {
  try {
    const raw =
      window.localStorage.getItem('settletrack_session') ||
      window.sessionStorage.getItem('settletrack_session')
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return isObject(parsed) ? parsed : null
  } catch {
    return null
  }
}

function App() {
  const storedSession = readStoredSession()

  const [activePage, setActivePage] = useState<ActivePage>('dashboard')
  const [fullName, setFullName] = useState(getString(storedSession?.fullName))
  const [email, setEmail] = useState(getString(storedSession?.email))
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [token, setToken] = useState(getString(storedSession?.token))
  const [authMessage, setAuthMessage] = useState('')
  const [authView, setAuthView] = useState<'credentials' | 'forgot' | 'reset'>('credentials')
  const [rememberMe, setRememberMe] = useState(true)
  const [forgotEmail, setForgotEmail] = useState('')
  const [resetToken, setResetToken] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showWakeupHint, setShowWakeupHint] = useState(false)
  const googleButtonContainerRef = useRef<HTMLDivElement | null>(null)
  const [meInfo, setMeInfo] = useState<{
    isAdmin: boolean
    trialDaysRemaining: number
    trialExpired: boolean
  } | null>(null)
  const [myBusinesses, setMyBusinesses] = useState<BusinessSummary[]>([])
  const [isEditingBusiness, setIsEditingBusiness] = useState(false)
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
  const [mismatchListLimit, setMismatchListLimit] = useState(10)
  const [mismatchSearchText, setMismatchSearchText] = useState('')
  const [mismatchTypeFilter, setMismatchTypeFilter] = useState('all')
  const [reconciliationIsStale, setReconciliationIsStale] = useState(false)
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const showToast = (message: string, type: ToastItem['type'] = 'success') => {
    const id = Date.now() + Math.random()
    setToasts((current) => [...current, { id, message, type }])
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id))
    }, 4500)
  }

  const dismissToast = (id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }

  const [loadingStates, setLoadingStates] = useState({
    register: false,
    login: false,
    createBusiness: false,
    uploadCsv: false,
    runReconciliation: false,
    viewDashboard: false,
    exportCsv: false,
    exportMismatches: false,
    forgotPassword: false,
    resetPassword: false,
    googleLogin: false,
    submitFeedback: false,
    upgradeInterest: false,
    loadAdminData: false,
    updateBusiness: false,
    deleteImport: false,
  })

  const [businessName, setBusinessName] = useState(getString(storedSession?.businessName))
  const [category, setCategory] = useState(getString(storedSession?.category))
  const [location, setLocation] = useState(getString(storedSession?.location))
  const [contactEmail, setContactEmail] = useState(getString(storedSession?.contactEmail))
  const [contactPhone, setContactPhone] = useState(getString(storedSession?.contactPhone))
  const [businessId, setBusinessId] = useState<number | null>(
    typeof storedSession?.businessId === 'number' ? storedSession.businessId : null
  )

  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [selectedProvider, setSelectedProvider] = useState('Paystack')

  const [feedbackText, setFeedbackText] = useState('')
  const [feedbackRating, setFeedbackRating] = useState<number | null>(null)
  const [feedbackSentMessage, setFeedbackSentMessage] = useState('')

  const [adminOverview, setAdminOverview] = useState<unknown>(null)
  const [adminUsers, setAdminUsers] = useState<unknown[]>([])
  const [adminFeedback, setAdminFeedback] = useState<unknown[]>([])

  useEffect(() => {
    fetch(`${API_URL}/health`).catch(() => {
      // Pre-warm only - a failure here is not user-facing.
    })
  }, [])

  useEffect(() => {
    if (token) {
      fetchMe(token)
      fetchMyBusinesses(token)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    try {
      if (!token) {
        window.localStorage.removeItem('settletrack_session')
        window.sessionStorage.removeItem('settletrack_session')
        return
      }

      const sessionJson = JSON.stringify({
        token,
        fullName,
        email,
        businessId,
        businessName,
        category,
        location,
        contactEmail,
        contactPhone,
      })

      // "Remember me" controls where the session lives: localStorage survives
      // a full browser/device restart (until explicit logout); sessionStorage
      // clears when the tab/browser closes - the right default on a shared
      // or public computer where the user didn't ask to stay signed in.
      if (rememberMe) {
        window.sessionStorage.removeItem('settletrack_session')
        window.localStorage.setItem('settletrack_session', sessionJson)
      } else {
        window.localStorage.removeItem('settletrack_session')
        window.sessionStorage.setItem('settletrack_session', sessionJson)
      }
    } catch {
      // Browser storage unavailable (private mode, blocked site data) - session simply won't persist.
    }
  }, [
    token,
    rememberMe,
    fullName,
    email,
    businessId,
    businessName,
    category,
    location,
    contactEmail,
    contactPhone,
  ])

  const sessionExpiredHandledRef = useRef(false)
  const handleGoogleCredentialRef = useRef(handleGoogleCredential)

  useEffect(() => {
    handleGoogleCredentialRef.current = handleGoogleCredential
  })

  useEffect(() => {
    if (token || !GOOGLE_CLIENT_ID) return

    let cancelled = false
    let attempts = 0

    const tryInitGoogleButton = () => {
      if (cancelled) return

      if (!window.google || !googleButtonContainerRef.current) {
        attempts += 1
        if (attempts < 40) {
          window.setTimeout(tryInitGoogleButton, 250)
        }
        return
      }

      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (response) => {
          handleGoogleCredentialRef.current(response.credential)
        },
      })

      window.google.accounts.id.renderButton(googleButtonContainerRef.current, {
        theme: 'outline',
        size: 'large',
        width: 320,
        text: 'continue_with',
      })
    }

    tryInitGoogleButton()

    return () => {
      cancelled = true
    }
  }, [token, authView])

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

    if (password.length < 8) {
      const message = 'Password must be at least 8 characters.'
      setAuthMessage(message)
      showToast(message, 'error')
      return
    }

    setActionLoading('register', true)
    const wakeupTimer = window.setTimeout(() => setShowWakeupHint(true), 6000)

    try {
      const response = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: fullName, email, password }),
      })

      const data = await response.json()

      if (!response.ok) {
        const message = getErrorMessage(data, 'Registration failed.')
        setAuthMessage(message)
        showToast(message, 'error')
        return
      }

      setAuthMessage('Account created. Logging you in...')
      showToast('Account created!')
      await loginUser()
    } catch {
      setAuthMessage('Registration failed.')
      showToast('Registration failed. Please try again.', 'error')
    } finally {
      window.clearTimeout(wakeupTimer)
      setShowWakeupHint(false)
      setActionLoading('register', false)
    }
  }

  async function loginUser() {
    if (!email.trim() || !password.trim()) {
      setAuthMessage('Please enter email and password.')
      return
    }

    setActionLoading('login', true)
    const wakeupTimer = window.setTimeout(() => setShowWakeupHint(true), 6000)

    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = await response.json()

      if (!response.ok) {
        const message = getErrorMessage(data, 'Login failed.')
        setAuthMessage(message)
        showToast(message, 'error')
        return
      }

      if (data.access_token) {
        sessionExpiredHandledRef.current = false
        setToken(data.access_token)
        setAuthMessage('Logged in successfully.')
        showToast('Logged in successfully!')
        resetWorkspaceState()
        setActivePage('dashboard')
        fetchMe(data.access_token)
        fetchMyBusinesses(data.access_token)
        return
      }

      setAuthMessage('Login failed.')
      showToast('Login failed.', 'error')
    } catch {
      setAuthMessage('Login failed.')
      showToast('Login failed. Please try again.', 'error')
    } finally {
      window.clearTimeout(wakeupTimer)
      setShowWakeupHint(false)
      setActionLoading('login', false)
    }
  }

  async function handleGoogleCredential(idToken: string) {
    setActionLoading('googleLogin', true)

    try {
      const response = await fetch(`${API_URL}/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_token: idToken }),
      })

      const data = await response.json()

      if (!response.ok) {
        const message = getErrorMessage(data, 'Google sign-in failed.')
        setAuthMessage(message)
        showToast(message, 'error')
        return
      }

      if (data.access_token) {
        sessionExpiredHandledRef.current = false
        setToken(data.access_token)
        setAuthMessage('Logged in with Google.')
        showToast('Logged in with Google!')
        resetWorkspaceState()
        setActivePage('dashboard')
        fetchMe(data.access_token)
        fetchMyBusinesses(data.access_token)
        return
      }

      setAuthMessage('Google sign-in failed.')
      showToast('Google sign-in failed.', 'error')
    } catch {
      setAuthMessage('Google sign-in failed.')
      showToast('Google sign-in failed. Please try again.', 'error')
    } finally {
      setActionLoading('googleLogin', false)
    }
  }

  async function forgotPassword() {
    if (!forgotEmail.trim()) {
      setAuthMessage('Please enter your email.')
      return
    }

    setActionLoading('forgotPassword', true)

    try {
      const response = await fetch(`${API_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail }),
      })

      const data = await response.json()
      const devToken = getString(data.dev_reset_token)

      if (devToken) {
        setResetToken(devToken)
        setAuthMessage(
          `${getString(data.message)}\n${getString(data.dev_note)}\nDev reset token: ${devToken}`
        )
        setAuthView('reset')
        showToast('Reset link created.')
        return
      }

      setAuthMessage(getString(data.message) || 'If an account exists for that email, a reset link has been sent.')
      showToast('If an account exists for that email, a reset link has been sent.')
    } catch {
      setAuthMessage('Could not request a password reset. Please try again.')
      showToast('Could not request a password reset. Please try again.', 'error')
    } finally {
      setActionLoading('forgotPassword', false)
    }
  }

  async function resetPassword() {
    if (!resetToken.trim() || !newPassword.trim()) {
      setAuthMessage('Please enter the reset token and a new password.')
      return
    }

    setActionLoading('resetPassword', true)

    try {
      const response = await fetch(`${API_URL}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: resetToken, new_password: newPassword }),
      })

      const data = await response.json()

      if (!response.ok) {
        const message = getErrorMessage(data, 'Could not reset password.')
        setAuthMessage(message)
        showToast(message, 'error')
        return
      }

      setAuthMessage(getString(data.message) || 'Password has been reset. You can now log in.')
      showToast('Password reset successfully!')
      setAuthView('credentials')
      setPassword('')
      setNewPassword('')
      setResetToken('')
      setForgotEmail('')
    } catch {
      setAuthMessage('Could not reset password. Please try again.')
      showToast('Could not reset password. Please try again.', 'error')
    } finally {
      setActionLoading('resetPassword', false)
    }
  }

  function clearBusinessScopedViewState() {
    setBusinessMessage('')
    setCsvMessage('')
    setExportMessage('')
    setCsvFile(null)
    setSelectedProvider('Paystack')
    setLastImports([])
    setDetectedColumns([])
    setShowDetectedColumns(false)
    setReconciliationMessage(null)
    setDashboardMessage(null)
    setLastReconciliationDate('Not run yet')
    setMismatchListLimit(10)
    setReconciliationIsStale(false)
    setMismatchSearchText('')
    setMismatchTypeFilter('all')
  }

  function resetWorkspaceState() {
    clearBusinessScopedViewState()
    setBusinessName('')
    setCategory('')
    setLocation('')
    setContactEmail('')
    setContactPhone('')
    setBusinessId(null)
  }

  function switchActiveBusiness(business: BusinessSummary) {
    if (business.id === businessId) return

    clearBusinessScopedViewState()
    setBusinessId(business.id)
    setBusinessName(business.name)
    setCategory(business.category)
    setLocation(business.location)
    setContactEmail(business.contactEmail)
    setContactPhone(business.contactPhone)
    showToast(`Switched to ${business.name}`)
  }

  function logoutUser() {
    setToken('')
    setPassword('')
    setShowPassword(false)
    setAuthMessage('')
    setAuthView('credentials')
    setForgotEmail('')
    setResetToken('')
    setNewPassword('')
    setMeInfo(null)
    setRememberMe(true)
    resetWorkspaceState()
    setActivePage('dashboard')
  }

  async function fetchMe(authToken: string) {
    try {
      const response = await fetch(`${API_URL}/me`, {
        headers: { Authorization: `Bearer ${authToken}` },
      })

      if (!response.ok) return

      const data = await response.json()

      if (!isObject(data)) return

      setMeInfo({
        isAdmin: data.is_admin === true,
        trialDaysRemaining: getNumber(data.trial_days_remaining),
        trialExpired: data.trial_expired === true,
      })
    } catch {
      // Non-critical - admin nav and trial badge simply won't show.
    }
  }

  async function fetchMyBusinesses(authToken: string) {
    try {
      const response = await fetch(`${API_URL}/businesses/my`, {
        headers: { Authorization: `Bearer ${authToken}` },
      })

      if (!response.ok) return

      const data = await response.json()

      if (!Array.isArray(data)) return

      setMyBusinesses(
        data
          .filter((item): item is ApiObject => isObject(item) && typeof item.id === 'number')
          .map((item) => ({
            id: item.id as number,
            name: getString(item.name) || `Business ${item.id}`,
            category: getString(item.category),
            location: getString(item.location),
            contactEmail: getString(item.contact_email),
            contactPhone: getString(item.contact_phone),
          }))
      )
    } catch {
      // Non-critical - the business switcher simply won't show.
    }
  }

  async function authFetch(url: string, options: RequestInit = {}) {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${token}`,
      },
    })

    if (response.status === 401 && !sessionExpiredHandledRef.current) {
      sessionExpiredHandledRef.current = true
      showToast('Your session has expired. Please log in again.', 'error')
      logoutUser()
    }

    return response
  }

  async function createBusiness() {
    if (businessName.trim().length < 2) {
      const message = 'Please enter a business name (at least 2 characters).'
      setBusinessMessage(message)
      showToast(message, 'error')
      return
    }

    setActionLoading('createBusiness', true)

    try {
      const response = await authFetch(`${API_URL}/businesses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: businessName,
          category,
          location,
          contact_email: contactEmail,
          contact_phone: contactPhone,
        }),
      })

      if (response.status === 401) return

      const data = await response.json()

      if (data.business_id) {
        setBusinessId(data.business_id)
        setBusinessMessage(
          `${getString(data.message) || 'Business registered successfully.'}\nActive Business ID: ${data.business_id}`
        )
        showToast('Business registered successfully!')
        setActivePage('dashboard')
        fetchMyBusinesses(token)
        return
      }

      const message = getErrorMessage(data, 'Business registration failed.')
      setBusinessMessage(message)
      showToast(message, 'error')
    } catch {
      setBusinessMessage('Business registration failed.')
      showToast('Business registration failed. Please try again.', 'error')
    } finally {
      setActionLoading('createBusiness', false)
    }
  }

  function cancelEditBusiness() {
    const original = myBusinesses.find((b) => b.id === businessId)
    if (original) {
      setBusinessName(original.name)
      setCategory(original.category)
      setLocation(original.location)
      setContactEmail(original.contactEmail)
      setContactPhone(original.contactPhone)
    }
    setIsEditingBusiness(false)
  }

  async function updateBusiness() {
    if (!businessId) return

    if (businessName.trim().length < 2) {
      const message = 'Please enter a business name (at least 2 characters).'
      setBusinessMessage(message)
      showToast(message, 'error')
      return
    }

    setActionLoading('updateBusiness', true)

    try {
      const response = await authFetch(`${API_URL}/businesses/${businessId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: businessName,
          category,
          location,
          contact_email: contactEmail,
          contact_phone: contactPhone,
        }),
      })

      if (response.status === 401) return

      const data = await response.json()

      if (!response.ok) {
        const message = getErrorMessage(data, 'Could not update business.')
        setBusinessMessage(message)
        showToast(message, 'error')
        return
      }

      setBusinessMessage(getString(data.message) || 'Business updated successfully.')
      showToast('Business updated successfully!')
      setIsEditingBusiness(false)
      fetchMyBusinesses(token)
    } catch {
      showToast('Could not update business. Please try again.', 'error')
    } finally {
      setActionLoading('updateBusiness', false)
    }
  }

  async function deleteImportBatch(batchId: string) {
    if (!businessId) return

    setActionLoading('deleteImport', true)

    try {
      const response = await authFetch(
        `${API_URL}/csv/imports/${batchId}?business_id=${businessId}`,
        { method: 'DELETE' }
      )

      if (response.status === 401) return

      const data = await response.json()

      if (!response.ok) {
        showToast(getErrorMessage(data, 'Could not remove this import.'), 'error')
        return
      }

      setLastImports((current) => current.filter((item) => item.batchId !== batchId))
      showToast(getString(data.message) || 'Import removed.')

      if (lastReconciliationDate !== 'Not run yet') {
        setReconciliationIsStale(true)
      }
    } catch {
      showToast('Could not remove this import. Please try again.', 'error')
    } finally {
      setActionLoading('deleteImport', false)
    }
  }

  async function uploadCsv() {
    if (!businessId) {
      setCsvMessage('Please register a business first.')
      return
    }

    if (!csvFile) {
      setCsvMessage('Please choose a CSV, Excel, or PDF file first.')
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

      const response = await authFetch(`${API_URL}/csv/transactions`, {
        method: 'POST',
        body: formData,
      })

      if (response.status === 401) return

      const data = await response.json()
      const result = getCsvUploadResult(data)

      setCsvMessage(result.message)
      setDetectedColumns(result.detectedColumns)
      if (result.imported > 0 && lastReconciliationDate !== 'Not run yet') {
        setReconciliationIsStale(true)
      }
      if (result.imported > 0) {
        showToast(`${result.imported} transaction${result.imported === 1 ? '' : 's'} imported successfully.`)
      } else {
        showToast('No transactions were imported. Check the file and try again.', 'error')
      }
      setLastImports((current) =>
        [
          {
            fileName: csvFile.name,
            provider: selectedProvider,
            imported: result.imported,
            rejected: result.rejected,
            fileType: result.fileType,
            batchId: result.batchId,
          },
          ...current,
        ].slice(0, 5)
      )
    } catch {
      setCsvMessage('Smart import failed. Please try again.')
      showToast('Smart import failed. Please try again.', 'error')
    } finally {
      setActionLoading('uploadCsv', false)
    }
  }

  async function runReconciliation() {
    if (!businessId) {
      setReconciliationMessage('Please register a business first.')
      return
    }

    setActionLoading('runReconciliation', true)

    try {
      const response = await authFetch(
        `${API_URL}/reconciliation/run?business_id=${businessId}`,
        { method: 'POST' }
      )

      if (response.status === 401) return

      const data = await response.json()
      setReconciliationMessage(data)
      setLastReconciliationDate(new Date().toLocaleString())
      setMismatchListLimit(10)
      setReconciliationIsStale(false)
      showToast('Reconciliation complete.')
    } catch {
      setReconciliationMessage('Reconciliation failed. Please try again.')
      showToast('Reconciliation failed. Please try again.', 'error')
    } finally {
      setActionLoading('runReconciliation', false)
    }
  }

  async function viewDashboard() {
    if (!businessId) {
      setDashboardMessage('Please register a business first.')
      return
    }

    setActionLoading('viewDashboard', true)

    try {
      const response = await authFetch(
        `${API_URL}/dashboard/summary?business_id=${businessId}`
      )

      if (response.status === 401) return

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
      setExportMessage('Please register a business first.')
      return
    }

    setActionLoading('exportCsv', true)

    try {
      const response = await authFetch(
        `${API_URL}/export/transactions?business_id=${businessId}`
      )

      if (response.status === 401) return

      if (!response.ok) {
        setExportMessage('CSV export failed. Please try again.')
        showToast('CSV export failed. Please try again.', 'error')
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
      showToast('CSV exported successfully.')
    } catch {
      setExportMessage('CSV export failed. Please try again.')
      showToast('CSV export failed. Please try again.', 'error')
    } finally {
      setActionLoading('exportCsv', false)
    }
  }

  async function exportMismatches() {
    if (!businessId) {
      setExportMessage('Please register a business first.')
      return
    }

    setActionLoading('exportMismatches', true)

    try {
      const response = await authFetch(
        `${API_URL}/export/mismatches?business_id=${businessId}`
      )

      if (response.status === 401) return

      if (!response.ok) {
        setExportMessage('Mismatch export failed. Please try again.')
        showToast('Mismatch export failed. Please try again.', 'error')
        return
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)

      const link = document.createElement('a')
      link.href = url
      link.download = 'settletrack-mismatches.csv'
      link.click()

      window.URL.revokeObjectURL(url)
      setExportMessage('Mismatch report exported successfully.')
      showToast('Mismatch report exported successfully.')
    } catch {
      setExportMessage('Mismatch export failed. Please try again.')
      showToast('Mismatch export failed. Please try again.', 'error')
    } finally {
      setActionLoading('exportMismatches', false)
    }
  }

  async function submitFeedback() {
    if (!feedbackText.trim()) {
      setFeedbackSentMessage('Please enter a message before submitting.')
      return
    }

    setActionLoading('submitFeedback', true)

    try {
      const response = await authFetch(`${API_URL}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: feedbackText, rating: feedbackRating }),
      })

      if (response.status === 401) return

      const data = await response.json()

      if (!response.ok) {
        const message = getErrorMessage(data, 'Could not submit feedback. Please try again.')
        setFeedbackSentMessage(message)
        showToast(message, 'error')
        return
      }

      setFeedbackSentMessage(getString(data.message) || 'Thank you for your feedback!')
      showToast('Feedback submitted — thank you!')
      setFeedbackText('')
      setFeedbackRating(null)
    } catch {
      setFeedbackSentMessage('Could not submit feedback. Please try again.')
      showToast('Could not submit feedback. Please try again.', 'error')
    } finally {
      setActionLoading('submitFeedback', false)
    }
  }

  async function requestUpgrade() {
    setActionLoading('upgradeInterest', true)

    try {
      const response = await authFetch(`${API_URL}/upgrade-interest`, {
        method: 'POST',
      })

      if (response.status === 401) return

      if (!response.ok) {
        showToast('Could not send your upgrade request. Please try WhatsApp instead.', 'error')
        return
      }

      showToast("Thanks! We'll be in touch about upgrading.")
    } catch {
      showToast('Could not send your upgrade request. Please try WhatsApp instead.', 'error')
    } finally {
      setActionLoading('upgradeInterest', false)
    }
  }

  async function loadAdminData() {
    setActionLoading('loadAdminData', true)

    try {
      const [overviewRes, usersRes, feedbackRes] = await Promise.all([
        authFetch(`${API_URL}/admin/overview`),
        authFetch(`${API_URL}/admin/users`),
        authFetch(`${API_URL}/admin/feedback`),
      ])

      if (overviewRes.status === 401) return

      if (overviewRes.ok) setAdminOverview(await overviewRes.json())
      if (usersRes.ok) setAdminUsers(await usersRes.json())
      if (feedbackRes.ok) setAdminFeedback(await feedbackRes.json())
    } catch {
      showToast('Could not load admin data.', 'error')
    } finally {
      setActionLoading('loadAdminData', false)
    }
  }

  const reconciliationStats = getReconciliationStats(reconciliationMessage)
  const totalTransactions = getDashboardTotalTransactions(dashboardMessage, lastImports)

  if (!token) {
    return (
      <>
        <ToastStack toasts={toasts} onDismiss={dismissToast} />
        <WhatsAppSupportButton />
        <main className="auth-page">
        <section className="auth-card">
          <div className="brand-mark">ST</div>
          <h1>SettleTrack</h1>
          <p>
            Payment reconciliation and settlement reporting for Nigerian SMEs.
          </p>

          {authView === 'credentials' && (
            <div className="auth-form">
              <label htmlFor="full-name">Full Name</label>
              <input id="full-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />

              <label htmlFor="email">Email</label>
              <input id="email" value={email} onChange={(e) => setEmail(e.target.value)} />

              <label htmlFor="password">Password</label>
              <div className="password-field">
                <input
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type={showPassword ? 'text' : 'password'}
                />
                <PasswordEyeToggle
                  visible={showPassword}
                  onToggle={() => setShowPassword((current) => !current)}
                />
              </div>
              <p className="muted field-hint">At least 8 characters.</p>

              <label className="remember-me-row" htmlFor="remember-me">
                <input
                  id="remember-me"
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                Keep me logged in on this device
              </label>

              <button
                className="link-button forgot-password-link"
                type="button"
                onClick={() => {
                  setForgotEmail(email)
                  setAuthMessage('')
                  setAuthView('forgot')
                }}
              >
                Forgot password?
              </button>

              <div className="actions">
                <button disabled={loadingStates.register} onClick={registerUser}>
                  {loadingStates.register ? <LoadingLabel text="creating your account" /> : 'Create Account'}
                </button>
                <button disabled={loadingStates.login} onClick={loginUser}>
                  {loadingStates.login ? <LoadingLabel text="logging you in" /> : 'Login'}
                </button>
              </div>

              {showWakeupHint && (
                <p className="wakeup-hint">
                  Still working — our free server may be waking up from inactivity. This can take up to a minute on the first try.
                </p>
              )}

              <div className="auth-divider"><span>or</span></div>

              {GOOGLE_CLIENT_ID ? (
                <div className="google-button-wrap" ref={googleButtonContainerRef} />
              ) : (
                <button className="secondary-button google-button-stub" type="button" disabled>
                  Continue with Google (not configured)
                </button>
              )}

              {authMessage && <div className="success local-feedback">{renderTextLines(authMessage)}</div>}
            </div>
          )}

          {authView === 'forgot' && (
            <div className="auth-form">
              <p className="muted">Enter your account email and we'll create a password reset link.</p>

              <label htmlFor="forgot-email">Email</label>
              <input
                id="forgot-email"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
              />

              <div className="actions">
                <button disabled={loadingStates.forgotPassword} onClick={forgotPassword}>
                  {loadingStates.forgotPassword ? <LoadingLabel text="sending reset link" /> : 'Send Reset Link'}
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => {
                    setAuthMessage('')
                    setAuthView('credentials')
                  }}
                >
                  Back to login
                </button>
              </div>

              {authMessage && <div className="success local-feedback">{renderTextLines(authMessage)}</div>}
            </div>
          )}

          {authView === 'reset' && (
            <div className="auth-form">
              <p className="muted">Paste your reset token and choose a new password.</p>

              <label htmlFor="reset-token">Reset Token</label>
              <input
                id="reset-token"
                value={resetToken}
                onChange={(e) => setResetToken(e.target.value)}
              />

              <label htmlFor="new-password">New Password</label>
              <div className="password-field">
                <input
                  id="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  type={showNewPassword ? 'text' : 'password'}
                />
                <PasswordEyeToggle
                  visible={showNewPassword}
                  onToggle={() => setShowNewPassword((current) => !current)}
                />
              </div>

              <div className="actions">
                <button disabled={loadingStates.resetPassword} onClick={resetPassword}>
                  {loadingStates.resetPassword ? <LoadingLabel text="resetting password" /> : 'Reset Password'}
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => {
                    setAuthMessage('')
                    setAuthView('credentials')
                  }}
                >
                  Back to login
                </button>
              </div>

              {authMessage && <div className="success local-feedback">{renderTextLines(authMessage)}</div>}
            </div>
          )}
        </section>
        </main>
      </>
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
            {loadingStates.viewDashboard ? <LoadingLabel text="refreshing" /> : 'Refresh dashboard'}
          </button>
        </div>

        {businessMessage && (
          <div className="success local-feedback">
            {renderTextLines(businessMessage)}
          </div>
        )}

        {!businessId && totalTransactions === 0 && lastReconciliationDate === 'Not run yet' && (
          <div className="clarity-card welcome-card">
            <h2>Welcome to SettleTrack.</h2>
            <p>
              Use SettleTrack to upload your payment records, run reconciliation,
              and find missing, duplicate, or mismatched payments.
            </p>
            <p>Start by registering a business, then upload transactions.</p>
          </div>
        )}

        <div className="clarity-card getting-started-card">
          <h2>Getting started</h2>
          <div className="step-grid">
            <div><strong>1. Register your business</strong><span>Add the business you want to reconcile.</span></div>
            <div><strong>2. Upload transaction records</strong><span>Import payment records from CSV, Excel, or bank statements.</span></div>
            <div><strong>3. Run reconciliation</strong><span>Find missing, duplicate, and mismatched payments.</span></div>
            <div><strong>4. Export your report</strong><span>Download a clean CSV for review or accounting.</span></div>
          </div>
        </div>

        <div className="clarity-card value-card">
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
            <li>Register a business</li>
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
            <p className="eyebrow">Business registration</p>
            <h1>Register Business</h1>
            <p>Register the business you want to reconcile.</p>
          </div>
        </div>

        <label htmlFor="business-name">Business Name (required)</label>
        <input
          id="business-name"
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
        />

        <label htmlFor="business-category">Category (optional)</label>
        <input id="business-category" value={category} onChange={(e) => setCategory(e.target.value)} />

        <label htmlFor="business-location">Location (optional)</label>
        <input id="business-location" value={location} onChange={(e) => setLocation(e.target.value)} />

        <label htmlFor="business-contact-email">Contact Email (optional)</label>
        <input
          id="business-contact-email"
          value={contactEmail}
          onChange={(e) => setContactEmail(e.target.value)}
        />

        <label htmlFor="business-contact-phone">Contact Phone (optional)</label>
        <input
          id="business-contact-phone"
          value={contactPhone}
          onChange={(e) => setContactPhone(e.target.value)}
        />

        <button disabled={loadingStates.createBusiness} onClick={createBusiness}>
          {loadingStates.createBusiness ? <LoadingLabel text="saving business" /> : 'Register Business'}
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
            <strong>{businessId ? (businessName || `Business ${businessId}`) : 'Register business first'}</strong>
          </p>

          <label htmlFor="provider-select">Provider</label>
          <select
            id="provider-select"
            value={selectedProvider}
            onChange={(e) => setSelectedProvider(e.target.value)}
          >
            <option>Paystack</option>
            <option>Bank Statement</option>
            <option>Other</option>
            <option disabled>Flutterwave (coming soon)</option>
            <option disabled>Monnify (coming soon)</option>
          </select>

          <label htmlFor="transaction-file">Transaction File</label>
          <input
            id="transaction-file"
            type="file"
            accept=".csv,.xlsx,.pdf"
            onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
          />
          <p className="muted field-hint">
            Accepts CSV, Excel (.xlsx), or PDF statements (e.g. Bolt, bank, or payment provider exports).
            PDFs must have real, selectable text — not a scanned or photographed copy.
          </p>

          <button
            disabled={!businessId || loadingStates.uploadCsv}
            onClick={uploadCsv}
          >
            {loadingStates.uploadCsv ? <LoadingLabel text="importing transactions" /> : 'Import Transactions'}
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
          <p className="muted">
            Uploaded the wrong file? Remove it below to take its transactions back out.
          </p>
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
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {lastImports.map((item, index) => (
                    <tr key={item.batchId || `${item.fileName}-${item.provider}-${index}`}>
                      <td>{item.fileName}</td>
                      <td>{item.provider}</td>
                      <td>{item.imported}</td>
                      <td>{item.rejected}</td>
                      <td>
                        {item.batchId && (
                          <button
                            className="secondary-button danger-button"
                            type="button"
                            disabled={loadingStates.deleteImport}
                            onClick={() => deleteImportBatch(item.batchId as string)}
                          >
                            {loadingStates.deleteImport ? <LoadingLabel text="removing" /> : 'Delete'}
                          </button>
                        )}
                      </td>
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
    const allIssueItems = items.filter((item) => getResultType(item) !== 'MATCHED')

    const searchText = mismatchSearchText.trim().toLowerCase()
    const filteredIssueItems = allIssueItems.filter((item) => {
      if (mismatchTypeFilter !== 'all' && getResultType(item) !== mismatchTypeFilter) {
        return false
      }

      if (!searchText) return true

      return (
        getReference(item).toLowerCase().includes(searchText) ||
        getReason(item).toLowerCase().includes(searchText)
      )
    })

    const issueItems = filteredIssueItems.slice(0, mismatchListLimit)
    const hiddenIssueCount = filteredIssueItems.length - issueItems.length

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
              ? <LoadingLabel text="running reconciliation" />
              : 'Run Reconciliation'}
          </button>
        </div>

        {reconciliationIsStale && (
          <div className="warning-banner">
            New transactions were imported since the last reconciliation run.
            Run reconciliation again to include them.
          </div>
        )}

        {lastReconciliationDate !== 'Not run yet' && (
          <div className="local-result reconciliation-run-summary">
            <p><strong>Reconciliation completed successfully.</strong></p>
            <p>
              SettleTrack checked {totalTransactions} imported
              {totalTransactions === 1 ? ' transaction.' : ' transactions.'}
            </p>
            <p>Last run: {lastReconciliationDate}</p>
            {lastImports.length > 0 && lastImports[0].rejected > 0 && (
              <p>
                Last import issues: {lastImports[0].rejected} rejected
                {lastImports[0].rejected === 1 ? ' row' : ' rows'} shown on the Upload Transactions page.
              </p>
            )}

            {reconciliationStats.mismatchTotal === 0 &&
              reconciliationStats.unmatched === 0 &&
              reconciliationStats.amountMismatch === 0 &&
              reconciliationStats.duplicateReference === 0 &&
              reconciliationStats.failedPayment === 0 && (
                <p>
                  No reconciliation issues were found in the imported records.
                  Import issues such as duplicate or rejected rows are shown on the Upload Transactions page.
                </p>
              )}
          </div>
        )}

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
          <div className="summary-card">
            <span>Failed payment</span>
            <strong>{reconciliationStats.failedPayment}</strong>
          </div>
        </div>

        {typeof reconciliationMessage === 'string' && (
          <div className="local-result">{renderTextLines(reconciliationMessage)}</div>
        )}

        <div className="page-subsection">
          <div className="subsection-header">
            <h2>Mismatch list</h2>
            <div className="subsection-actions">
              <button
                disabled={!businessId || loadingStates.exportMismatches}
                onClick={exportMismatches}
              >
                {loadingStates.exportMismatches ? <LoadingLabel text="exporting" /> : 'Export Mismatches'}
              </button>
              <button
                className="secondary-button"
                disabled={!businessId || loadingStates.exportCsv}
                onClick={exportCsv}
              >
                {loadingStates.exportCsv ? <LoadingLabel text="downloading" /> : 'Download All CSV'}
              </button>
            </div>
          </div>

          <div className="explanation-box">
            <p><strong>Matched means</strong> the payment record looks correct.</p>
            <p><strong>Unmatched means</strong> SettleTrack could not find a matching record.</p>
            <p><strong>Amount mismatch means</strong> the reference exists but the amount is different.</p>
            <p><strong>Duplicate reference means</strong> the same payment reference appears more than once.</p>
            <p><strong>Failed payment means</strong> the transaction status shows the payment did not succeed.</p>
          </div>

          {allIssueItems.length > 0 && (
            <div className="mismatch-filters">
              <input
                type="text"
                placeholder="Search by reference or reason..."
                value={mismatchSearchText}
                onChange={(e) => setMismatchSearchText(e.target.value)}
                aria-label="Search mismatches"
              />
              <select
                value={mismatchTypeFilter}
                onChange={(e) => setMismatchTypeFilter(e.target.value)}
                aria-label="Filter by issue type"
              >
                <option value="all">All issue types</option>
                <option value="UNMATCHED">Unmatched</option>
                <option value="AMOUNT_MISMATCH">Amount mismatch</option>
                <option value="DUPLICATE_REFERENCE">Duplicate reference</option>
                <option value="FAILED_PAYMENT">Failed payment</option>
              </select>
            </div>
          )}

          {issueItems.length === 0 ? (
            <p className="muted">
              {allIssueItems.length === 0
                ? 'No reconciliation issues found in the imported records. Check Upload Transactions for rejected rows or duplicate import issues.'
                : 'No mismatches match your search or filter.'}
            </p>
          ) : (
            <div className="small-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Issue type</th>
                    <th>Reference</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {issueItems.map((item, index) => (
                    <tr key={`${getResultType(item)}-${index}`}>
                      <td>{friendlyFieldName(getResultType(item).toLowerCase())}</td>
                      <td>{getReference(item) || '—'}</td>
                      <td>{getReason(item)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {hiddenIssueCount > 0 && (
            <button
              className="secondary-button"
              type="button"
              onClick={() => setMismatchListLimit((current) => current + 10)}
            >
              Show {Math.min(hiddenIssueCount, 10)} more ({hiddenIssueCount} not shown)
            </button>
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
              {loadingStates.exportCsv ? <LoadingLabel text="exporting" /> : 'Export CSV'}
            </button>
          </div>

          <div className="report-card">
            <div>
              <h2>Export mismatch report</h2>
              <p>Download only the unmatched, duplicate, and mismatched records.</p>
            </div>
            <button disabled={!businessId || loadingStates.exportMismatches} onClick={exportMismatches}>
              {loadingStates.exportMismatches ? <LoadingLabel text="exporting" /> : 'Export Mismatches'}
            </button>
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
          <div className="subsection-header">
            <h2>Business information</h2>
            {businessId && !isEditingBusiness && (
              <button className="secondary-button" type="button" onClick={() => setIsEditingBusiness(true)}>
                Edit
              </button>
            )}
          </div>

          {!businessId ? (
            <p className="muted">No business registered yet.</p>
          ) : isEditingBusiness ? (
            <>
              <label htmlFor="edit-business-name">Business Name (required)</label>
              <input id="edit-business-name" value={businessName} onChange={(e) => setBusinessName(e.target.value)} />

              <label htmlFor="edit-business-category">Category (optional)</label>
              <input id="edit-business-category" value={category} onChange={(e) => setCategory(e.target.value)} />

              <label htmlFor="edit-business-location">Location (optional)</label>
              <input id="edit-business-location" value={location} onChange={(e) => setLocation(e.target.value)} />

              <label htmlFor="edit-business-contact-email">Contact Email (optional)</label>
              <input id="edit-business-contact-email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />

              <label htmlFor="edit-business-contact-phone">Contact Phone (optional)</label>
              <input id="edit-business-contact-phone" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />

              <div className="actions">
                <button disabled={loadingStates.updateBusiness} onClick={updateBusiness}>
                  {loadingStates.updateBusiness ? <LoadingLabel text="saving" /> : 'Save Changes'}
                </button>
                <button className="secondary-button" type="button" onClick={cancelEditBusiness}>
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <p><strong>Business:</strong> {businessName || 'Not provided'}</p>
              <p><strong>Business ID:</strong> {businessId}</p>
              <p><strong>Category:</strong> {category || 'Not provided'}</p>
              <p><strong>Location:</strong> {location || 'Not provided'}</p>
              <p><strong>Contact email:</strong> {contactEmail || 'Not provided'}</p>
              <p><strong>Contact phone:</strong> {contactPhone || 'Not provided'}</p>
            </>
          )}

          {businessMessage && (
            <div className="success local-feedback">{renderTextLines(businessMessage)}</div>
          )}
        </div>

        <div className="info-card">
          <h2>Share SettleTrack</h2>
          <p className="muted">Know a business that needs help with reconciliation? Share SettleTrack with them.</p>
          <div className="share-buttons">
            <a
              className="share-button share-whatsapp"
              href={`https://wa.me/?text=${encodeURIComponent(
                `Check out SettleTrack — payment reconciliation for Nigerian SMEs. ${window.location.origin}`
              )}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              WhatsApp
            </a>
            <a
              className="share-button share-twitter"
              href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(
                'Check out SettleTrack — payment reconciliation for Nigerian SMEs.'
              )}&url=${encodeURIComponent(window.location.origin)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              X / Twitter
            </a>
            <a
              className="share-button share-linkedin"
              href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(window.location.origin)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              LinkedIn
            </a>
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                navigator.clipboard
                  .writeText(window.location.origin)
                  .then(() => showToast('Link copied!'))
                  .catch(() => showToast('Could not copy link.', 'error'))
              }}
            >
              Copy Link
            </button>
          </div>
        </div>
      </section>
    )
  }

  function renderFeedbackPage() {
    return (
      <section className="page-section narrow-page">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Feedback</p>
            <h1>Tell us what you think</h1>
            <p>Your feedback directly shapes what we build next during this pilot.</p>
          </div>
        </div>

        <div className="form-card">
          <label htmlFor="feedback-message">Your feedback</label>
          <textarea
            id="feedback-message"
            rows={5}
            value={feedbackText}
            onChange={(e) => setFeedbackText(e.target.value)}
            placeholder="What's working well? What's confusing or missing?"
          />

          <label htmlFor="feedback-rating">How would you rate SettleTrack so far?</label>
          <select
            id="feedback-rating"
            value={feedbackRating ?? ''}
            onChange={(e) => setFeedbackRating(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Prefer not to say</option>
            <option value="5">5 — Excellent</option>
            <option value="4">4 — Good</option>
            <option value="3">3 — Okay</option>
            <option value="2">2 — Needs work</option>
            <option value="1">1 — Poor</option>
          </select>

          <button disabled={loadingStates.submitFeedback} onClick={submitFeedback}>
            {loadingStates.submitFeedback ? <LoadingLabel text="submitting" /> : 'Submit Feedback'}
          </button>

          {feedbackSentMessage && (
            <div className="success local-feedback">{renderTextLines(feedbackSentMessage)}</div>
          )}
        </div>
      </section>
    )
  }

  function renderPricingPage() {
    const trialDaysRemaining = meInfo?.trialDaysRemaining ?? 14
    const trialExpired = meInfo?.trialExpired ?? false

    return (
      <section className="page-section narrow-page">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Pricing</p>
            <h1>Pilot Pricing</h1>
            <p>SettleTrack is free during the pilot. Paid pricing is still being finalized based on pilot feedback.</p>
          </div>
        </div>

        <div className={trialExpired ? 'trial-card trial-expired' : 'trial-card'}>
          <h2>{trialExpired ? 'Your trial has ended' : 'You are on the 14-day free trial'}</h2>
          <p>
            {trialExpired
              ? 'Thanks for trying SettleTrack during the pilot. Reach out below to keep using it.'
              : `${trialDaysRemaining} day${trialDaysRemaining === 1 ? '' : 's'} remaining in your trial.`}
          </p>
        </div>

        <div className="info-card">
          <h2>What happens after the trial?</h2>
          <p>
            Pricing is still being decided with feedback from pilot users like you — nothing will be
            charged automatically. If you would like to keep using SettleTrack after your trial, let us know
            and we'll reach out about plans.
          </p>
          <div className="actions">
            <button disabled={loadingStates.upgradeInterest} onClick={requestUpgrade}>
              {loadingStates.upgradeInterest ? <LoadingLabel text="sending" /> : "I'm interested in upgrading"}
            </button>
            <a
              className="secondary-button whatsapp-link-button"
              href={WHATSAPP_SUPPORT_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              Chat on WhatsApp
            </a>
          </div>
        </div>
      </section>
    )
  }

  function renderAdminPage() {
    const overview = isObject(adminOverview) ? adminOverview : null

    return (
      <section className="page-section">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Admin</p>
            <h1>Pilot Overview</h1>
            <p>Visible only to admin accounts.</p>
          </div>
          <button disabled={loadingStates.loadAdminData} onClick={loadAdminData}>
            {loadingStates.loadAdminData ? <LoadingLabel text="loading" /> : 'Refresh'}
          </button>
        </div>

        {overview && (
          <div className="summary-grid">
            <div className="summary-card">
              <span>Total users</span>
              <strong>{getNumber(overview.total_users)}</strong>
            </div>
            <div className="summary-card">
              <span>Total businesses</span>
              <strong>{getNumber(overview.total_businesses)}</strong>
            </div>
            <div className="summary-card">
              <span>Total transactions</span>
              <strong>{getNumber(overview.total_transactions)}</strong>
            </div>
            <div className="summary-card">
              <span>Feedback received</span>
              <strong>{getNumber(overview.total_feedback)}</strong>
            </div>
            <div className="summary-card">
              <span>Upgrade interest</span>
              <strong>{getNumber(overview.total_upgrade_interest)}</strong>
            </div>
          </div>
        )}

        <div className="page-subsection">
          <h2>Users</h2>
          {adminUsers.length === 0 ? (
            <p className="muted">No data loaded yet. Click Refresh.</p>
          ) : (
            <div className="small-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Businesses</th>
                    <th>Admin</th>
                  </tr>
                </thead>
                <tbody>
                  {adminUsers.map((user, index) => {
                    const row = isObject(user) ? user : {}
                    return (
                      <tr key={index}>
                        <td>{getString(row.full_name)}</td>
                        <td>{getString(row.email)}</td>
                        <td>{getNumber(row.business_count)}</td>
                        <td>{row.is_admin ? 'Yes' : 'No'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="page-subsection">
          <h2>Feedback inbox</h2>
          {adminFeedback.length === 0 ? (
            <p className="muted">No feedback submitted yet.</p>
          ) : (
            <div className="small-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>From</th>
                    <th>Rating</th>
                    <th>Message</th>
                  </tr>
                </thead>
                <tbody>
                  {adminFeedback.map((item, index) => {
                    const row = isObject(item) ? item : {}
                    return (
                      <tr key={index}>
                        <td>{getString(row.submitted_by)} <span className="muted">({getString(row.contact_email)})</span></td>
                        <td>{row.rating ? `${getNumber(row.rating)}/5` : '—'}</td>
                        <td>{getString(row.message)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
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
    if (activePage === 'feedback') return renderFeedbackPage()
    if (activePage === 'pricing') return renderPricingPage()
    if (activePage === 'admin') return renderAdminPage()
    return renderDashboardPage()
  }

  const navigationItems: { key: ActivePage; label: string }[] = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'business', label: 'Register Business' },
    { key: 'upload', label: 'Upload Transactions' },
    { key: 'reconciliation', label: 'Reconciliation' },
    { key: 'reports', label: 'Reports / Export' },
    { key: 'pricing', label: 'Pricing' },
    { key: 'feedback', label: 'Feedback' },
    { key: 'settings', label: 'Settings' },
    ...(meInfo?.isAdmin ? [{ key: 'admin' as ActivePage, label: 'Admin' }] : []),
  ]

  return (
    <>
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
      <WhatsAppSupportButton />
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
            {myBusinesses.length > 1 ? (
              <select
                className="business-switcher"
                value={businessId ?? ''}
                onChange={(e) => {
                  const selected = myBusinesses.find((b) => b.id === Number(e.target.value))
                  if (selected) switchActiveBusiness(selected)
                }}
                aria-label="Switch active business"
              >
                {!businessId && <option value="">Choose a business</option>}
                {myBusinesses.map((business) => (
                  <option key={business.id} value={business.id}>
                    {business.name}
                  </option>
                ))}
              </select>
            ) : (
              <strong>{businessName || (businessId ? `Business ${businessId}` : 'Not set')}</strong>
            )}
          </div>
          <div>
            <span className="muted">Signed in as</span>
            <strong>{email}</strong>
          </div>
        </header>

        {renderActivePage()}
      </section>
      </main>
    </>
  )
}

export default App
