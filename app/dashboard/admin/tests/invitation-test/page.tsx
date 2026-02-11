'use client'

import { useEffect, useState } from 'react'
import { testFullInvitationFlow } from '@/app/actions/test-invitation'

const HIERARCHY_RANK: Record<string, number> = {
  employer: 90,
  gm: 80,
  agm: 70,
  shift_leader: 60,
  worker: 50,
}

type TestResult = { name: string; status: string; details: string }

export default function InvitationTestPage() {
  const [results, setResults] = useState<TestResult[]>([])
  const [loading, setLoading] = useState(true)
  const [backendResults, setBackendResults] = useState<{ passed: number; failed: number; tests: TestResult[] } | null>(null)
  const [integrationResults, setIntegrationResults] = useState<Awaited<ReturnType<typeof testFullInvitationFlow>> | null>(null)

  useEffect(() => {
    runTests()
  }, [])

  const runTests = () => {
    const tests: TestResult[] = []

    // TEST 1: Verify hierarchy ranks
    tests.push({
      name: 'Hierarchy rank values',
      status: HIERARCHY_RANK.employer === 90 && HIERARCHY_RANK.worker === 50 ? 'PASS' : 'FAIL',
      details: `employer=${HIERARCHY_RANK.employer}, worker=${HIERARCHY_RANK.worker}`,
    })

    // TEST 2: Check canInvite function logic
    const canInvite = (actorLevel: string, targetLevel: string) => {
      return (HIERARCHY_RANK[actorLevel] ?? 0) > (HIERARCHY_RANK[targetLevel] ?? 0)
    }

    tests.push({
      name: 'canInvite: employer → worker',
      status: canInvite('employer', 'worker') ? 'PASS' : 'FAIL',
      details: 'employer can invite worker',
    })

    tests.push({
      name: 'canInvite: gm → agm',
      status: canInvite('gm', 'agm') ? 'PASS' : 'FAIL',
      details: 'gm can invite agm',
    })

    tests.push({
      name: 'canInvite: worker → employer (should block)',
      status: !canInvite('worker', 'employer') ? 'PASS' : 'FAIL',
      details: 'worker cannot invite employer',
    })

    tests.push({
      name: 'canInvite: same level (should block)',
      status: !canInvite('gm', 'gm') ? 'PASS' : 'FAIL',
      details: 'gm cannot invite another gm',
    })

    // TEST 3: Check invite form validation
    const testEmail = 'test@example.com'
    const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testEmail)

    tests.push({
      name: 'Email validation regex',
      status: isValidEmail ? 'PASS' : 'FAIL',
      details: `${testEmail} is ${isValidEmail ? 'valid' : 'invalid'}`,
    })

    // TEST 4: Check hierarchy dropdown options for gm
    const actorLevel = 'gm'
    const availableLevels = Object.keys(HIERARCHY_RANK).filter(
      (level) => (HIERARCHY_RANK[actorLevel] ?? 0) > (HIERARCHY_RANK[level] ?? 0)
    )

    tests.push({
      name: 'Available invite levels for gm',
      status: availableLevels.includes('worker') && availableLevels.includes('agm') ? 'PASS' : 'FAIL',
      details: `gm can invite: ${availableLevels.join(', ') || 'none'}`,
    })

    setResults(tests)
    setLoading(false)
  }

  async function runBackendTest() {
    try {
      const response = await fetch('/api/test/invitation')
      const data = await response.json()
      setBackendResults(data)
    } catch (err) {
      setBackendResults({
        passed: 0,
        failed: 1,
        tests: [{ name: 'Backend fetch', status: 'FAIL', details: err instanceof Error ? err.message : String(err) }],
      })
    }
  }

  async function runIntegrationTest() {
    setIntegrationResults(null)
    const result = await testFullInvitationFlow()
    setIntegrationResults(result)
  }

  if (loading) return <div className="p-6">Running tests...</div>

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Invitation &amp; Hierarchy Tests</h1>

      <div className="mb-6 flex gap-2">
        <button
          type="button"
          onClick={runBackendTest}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
        >
          Run Backend API Tests
        </button>
        <button
          type="button"
          onClick={runIntegrationTest}
          className="bg-purple-500 text-white px-4 py-2 rounded hover:bg-purple-600"
        >
          Run Integration Test
        </button>
      </div>

      {integrationResults && (
        <div className="mb-8 p-4 bg-gray-50 rounded-lg">
          <h2 className="font-semibold mb-2">Integration Test (Server Action)</h2>
          <p className="text-sm text-gray-600 mb-2">
            Success: {integrationResults.success ? 'Yes' : 'No'}
            {integrationResults.error && ` — ${integrationResults.error}`}
          </p>
          {integrationResults.results && (
            <div className="space-y-2">
              {integrationResults.results.map((r, i) => (
                <div key={i} className="p-2 rounded text-sm bg-gray-100">
                  <span className="font-medium">{r.step}</span>: {r.status}
                  {r.org_name && ` (${r.org_name})`}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {backendResults && (
        <div className="mb-8 p-4 bg-gray-50 rounded-lg">
          <h2 className="font-semibold mb-2">Backend API Results</h2>
          <p className="text-sm text-gray-600 mb-2">
            Passed: {backendResults.passed} | Failed: {backendResults.failed}
          </p>
          <div className="space-y-2">
            {backendResults.tests.map((t, i) => (
              <div
                key={i}
                className={`p-2 rounded text-sm ${t.status === 'PASS' ? 'bg-green-50' : 'bg-red-50'}`}
              >
                <span className="font-medium">{t.name}</span>: {t.status} — {t.details}
              </div>
            ))}
          </div>
        </div>
      )}

      <h2 className="text-lg font-semibold mb-4">Frontend Logic Tests</h2>
      <div className="space-y-3">
        {results.map((test, idx) => (
          <div
            key={idx}
            className={`p-4 rounded-lg border ${
              test.status === 'PASS' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-medium">{test.name}</span>
              <span
                className={`px-2 py-1 rounded text-sm ${
                  test.status === 'PASS' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
                }`}
              >
                {test.status}
              </span>
            </div>
            <p className="text-gray-600 text-sm mt-1">{test.details}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 p-4 bg-gray-50 rounded-lg">
        <h2 className="font-semibold mb-2">Summary</h2>
        <p>Passed: {results.filter((r) => r.status === 'PASS').length}</p>
        <p>Failed: {results.filter((r) => r.status === 'FAIL').length}</p>
      </div>
    </div>
  )
}
