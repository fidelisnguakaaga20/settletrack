import { useState } from 'react'
import './App.css'

const API_URL = 'http://127.0.0.1:8000'

function App() {
  const [fullName, setFullName] = useState('Pilot User')
  const [email, setEmail] = useState('pilot@example.com')
  const [password, setPassword] = useState('testpassword123')
  const [token, setToken] = useState('')
  const [message, setMessage] = useState('')

  const [businessName, setBusinessName] = useState('Pilot Pharmacy')
  const [category, setCategory] = useState('Pharmacy')
  const [location, setLocation] = useState('Abuja')
  const [contactEmail, setContactEmail] = useState('pilot@example.com')
  const [contactPhone, setContactPhone] = useState('08012345678')
  const [businessId, setBusinessId] = useState<number | null>(null)

  const [csvFile, setCsvFile] = useState<File | null>(null)

  function show(data: unknown) {
    setMessage(JSON.stringify(data, null, 2))
  }

  async function registerUser() {
    const response = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name: fullName, email, password }),
    })

    show(await response.json())
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

    show(data)
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

    show(data)
  }

  async function uploadCsv() {
    if (!businessId) {
      setMessage('Please create a business first.')
      return
    }

    if (!csvFile) {
      setMessage('Please choose a CSV file first.')
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

    show(await response.json())
  }

  async function runReconciliation() {
    if (!businessId) {
      setMessage('Please create a business first.')
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
      setMessage('Please create a business first.')
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
      setMessage('Please create a business first.')
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
        <p>Payment reconciliation and settlement reporting for Nigerian SMEs.</p>
      </section>

      <section className="panel">
        <h2>1. Pilot Login Test</h2>

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

        {token && <p className="success">Logged in successfully.</p>}
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

        {businessId && (
          <p className="success">Active Business ID: {businessId}</p>
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

      <section className="panel">
        <h2>Response</h2>
        <pre>{message}</pre>
      </section>
    </main>
  )
}

export default App