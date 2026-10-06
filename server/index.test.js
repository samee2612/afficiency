import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createApiServer } from './index.js'

let server
let baseUrl

before(async () => {
  server = createApiServer()
  server.listen(0, '127.0.0.1')
  await new Promise((resolve, reject) => {
    server.once('listening', resolve)
    server.once('error', reject)
  })
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  server.closeAllConnections()
  await new Promise((resolve) => server.close(resolve))
})

const applicant = {
  firstName: 'Jamie',
  lastName: 'Davis',
  dateOfBirth: '06/15/1976',
  gender: 'Female',
  zipCode: '90210',
  tobaccoUse: 'No',
}

async function post(path, body) {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

test('checks age and California ZIP eligibility', async () => {
  const eligibleResponse = await post('/api/eligibility', { applicant })
  assert.equal(eligibleResponse.status, 200)
  assert.deepEqual(await eligibleResponse.json(), {
    eligible: true,
    age: 50,
    state: 'CA',
  })

  const nonCaliforniaResponse = await post('/api/eligibility', {
    applicant: { ...applicant, zipCode: '75006' },
  })
  assert.equal(nonCaliforniaResponse.status, 422)
  assert.deepEqual(await nonCaliforniaResponse.json(), {
    message: "We're not currently offering this product in that state.",
    field: 'zipCode',
  })

  const tooYoungResponse = await post('/api/eligibility', {
    applicant: { ...applicant, dateOfBirth: '01/01/2000' },
  })
  assert.equal(tooYoungResponse.status, 422)
  assert.equal((await tooYoungResponse.json()).field, 'dateOfBirth')
})

test('estimates sample rate classes as a flat rate per $1,000 of coverage', async () => {
  const response = await post('/api/quotes/estimate', {
    applicant,
    coverageAmount: 4000,
    rateClass: 'level-preferred',
    billingFrequency: 'monthly',
  })

  assert.equal(response.status, 200)
  const result = await response.json()
  assert.deepEqual(
    result.rateOptions.map(({ id, monthlyPremiumCents, annualPremiumCents }) => ({
      id,
      monthlyPremiumCents,
      annualPremiumCents,
    })),
    [
      { id: 'level-preferred', monthlyPremiumCents: 800, annualPremiumCents: 9600 },
      { id: 'level-non-tobacco', monthlyPremiumCents: 1200, annualPremiumCents: 14400 },
      { id: 'modified-non-tobacco', monthlyPremiumCents: 1800, annualPremiumCents: 21600 },
    ],
  )
  assert.match(result.disclaimer, /Illustrative demo rates only/)
})

test('uses fixed sample class rates at $35,000 coverage', async () => {
  const response = await post('/api/quotes/estimate', {
    applicant,
    coverageAmount: 35000,
    rateClass: 'level-preferred',
    billingFrequency: 'monthly',
  })

  assert.equal(response.status, 200)
  const result = await response.json()
  assert.deepEqual(
    result.rateOptions.map(({ id, available, monthlyPremiumCents }) => ({
      id,
      available,
      monthlyPremiumCents,
    })),
    [
      { id: 'level-preferred', available: true, monthlyPremiumCents: 7000 },
      { id: 'level-non-tobacco', available: true, monthlyPremiumCents: 10500 },
      { id: 'modified-non-tobacco', available: false, monthlyPremiumCents: null },
    ],
  )
})

test('keeps the rate table prices the same for monthly and annual policy totals', async () => {
  const quoteInput = {
    applicant,
    coverageAmount: 35000,
    rateClass: 'level-preferred',
  }
  const monthlyResponse = await post('/api/quotes/estimate', {
    ...quoteInput,
    billingFrequency: 'monthly',
  })
  const annualResponse = await post('/api/quotes/estimate', {
    ...quoteInput,
    billingFrequency: 'annual',
  })

  assert.equal(monthlyResponse.status, 200)
  assert.equal(annualResponse.status, 200)

  const monthlyQuote = await monthlyResponse.json()
  const annualQuote = await annualResponse.json()
  assert.deepEqual(annualQuote.rateOptions, monthlyQuote.rateOptions)
  assert.equal(monthlyQuote.billingFrequency, 'monthly')
  assert.equal(annualQuote.billingFrequency, 'annual')
})

test('reverse-quotes a $77 monthly target to the closest sample coverage', async () => {
  const response = await post('/api/quotes/estimate', {
    applicant,
    quoteBy: 'monthlyPremium',
    targetMonthlyPremiumCents: 7700,
    rateClass: 'level-preferred',
    billingFrequency: 'monthly',
  })

  assert.equal(response.status, 200)
  const result = await response.json()
  assert.deepEqual(
    result.rateOptions.map(({ id, coverageAmount, monthlyPremiumCents }) => ({
      id,
      coverageAmount,
      monthlyPremiumCents,
    })),
    [
      { id: 'level-preferred', coverageAmount: 38000, monthlyPremiumCents: 7600 },
      { id: 'level-non-tobacco', coverageAmount: 26000, monthlyPremiumCents: 7800 },
      { id: 'modified-non-tobacco', coverageAmount: 16000, monthlyPremiumCents: 7200 },
    ],
  )
})

test('rejects coverage outside the supported amount and increment', async () => {
  const tooSmall = await post('/api/quotes/estimate', {
    applicant,
    coverageAmount: 0,
    rateClass: 'level-preferred',
    billingFrequency: 'monthly',
  })
  assert.equal(tooSmall.status, 400)

  const invalidIncrement = await post('/api/quotes/estimate', {
    applicant,
    coverageAmount: 4500,
    rateClass: 'level-preferred',
    billingFrequency: 'monthly',
  })
  assert.equal(invalidIncrement.status, 400)
  assert.match((await invalidIncrement.json()).message, /increments/)

  const invalidPremium = await post('/api/quotes/estimate', {
    applicant,
    quoteBy: 'monthlyPremium',
    targetMonthlyPremiumCents: 0,
    rateClass: 'level-preferred',
    billingFrequency: 'monthly',
  })
  assert.equal(invalidPremium.status, 400)
})

test('validates applicant data and rate selection on the server', async () => {
  const invalidApplicant = await post('/api/quotes/estimate', {
    applicant: { ...applicant, dateOfBirth: '02/30/2000' },
    coverageAmount: 4000,
    rateClass: 'level-preferred',
    billingFrequency: 'monthly',
  })
  assert.equal(invalidApplicant.status, 400)

  const ineligibleApplicant = await post('/api/quotes/estimate', {
    applicant: { ...applicant, zipCode: '75006' },
    coverageAmount: 4000,
    rateClass: 'level-preferred',
    billingFrequency: 'monthly',
  })
  assert.equal(ineligibleApplicant.status, 422)

  const invalidRate = await post('/api/quotes/estimate', {
    applicant,
    coverageAmount: 4000,
    rateClass: 'not-a-rate',
    billingFrequency: 'monthly',
  })
  assert.equal(invalidRate.status, 400)
})

test('creates a retrievable demo quote after validating its payload', async () => {
  const createResponse = await post('/api/quotes', {
    applicant,
    coverageAmount: 4000,
    rateClass: 'level-preferred',
    billingFrequency: 'annual',
  })

  assert.equal(createResponse.status, 201)
  const createdQuote = await createResponse.json()
  assert.ok(createdQuote.quoteId)
  assert.equal(createdQuote.billingFrequency, 'annual')
  assert.equal(createdQuote.rateOptions[0].annualPremiumCents, 9600)

  const lookupResponse = await fetch(`${baseUrl}/api/quotes/${createdQuote.quoteId}`)
  assert.equal(lookupResponse.status, 200)
  assert.equal((await lookupResponse.json()).quoteId, createdQuote.quoteId)

  const missingResponse = await fetch(`${baseUrl}/api/quotes/not-found`)
  assert.equal(missingResponse.status, 404)
})

test('reports invalid JSON and unknown API routes', async () => {
  const invalidJson = await fetch(`${baseUrl}/api/quotes/estimate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{',
  })
  assert.equal(invalidJson.status, 400)

  const missingRoute = await fetch(`${baseUrl}/api/unknown`)
  assert.equal(missingRoute.status, 404)
})
