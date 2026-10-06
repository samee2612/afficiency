import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const MAX_BODY_BYTES = 16 * 1024
const DIST_DIRECTORY = resolve(fileURLToPath(new URL('../dist/', import.meta.url)))
const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
}
const RATE_CLASSES = [
  {
    id: 'level-preferred',
    label: 'Level Preferred',
    monthlyRateCentsPerThousand: 200,
    maxCoverageAmount: 50000,
  },
  {
    id: 'level-non-tobacco',
    label: 'Level Non-Tobacco',
    monthlyRateCentsPerThousand: 300,
    maxCoverageAmount: 50000,
  },
  {
    id: 'modified-non-tobacco',
    label: 'Modified Non-Tobacco',
    monthlyRateCentsPerThousand: 450,
    maxCoverageAmount: 16000,
  },
]
const MIN_COVERAGE_AMOUNT = 1000
const COVERAGE_INCREMENT = 1000
const MAX_MONTHLY_TARGET_CENTS = 50000
const MIN_APPLICANT_AGE = 50
const MAX_APPLICANT_AGE = 85
const GENDERS = new Set(['Female', 'Male'])

class HttpError extends Error {
  constructor(status, message, field) {
    super(message)
    this.status = status
    this.field = field
  }
}

function ageFromDate(date) {
  const today = new Date()
  let age = today.getFullYear() - date.getFullYear()
  if (
    today.getMonth() < date.getMonth() ||
    (today.getMonth() === date.getMonth() && today.getDate() < date.getDate())
  ) {
    age -= 1
  }
  return age
}

function isCaliforniaZip(zipCode) {
  const zip = Number(zipCode.slice(0, 5))
  return zip >= 90001 && zip <= 96162
}

function validateApplicant(applicant) {
  if (!applicant || typeof applicant !== 'object' || Array.isArray(applicant)) {
    throw new HttpError(400, 'Applicant details are required.')
  }

  const firstName = typeof applicant.firstName === 'string' ? applicant.firstName.trim() : ''
  const lastName = typeof applicant.lastName === 'string' ? applicant.lastName.trim() : ''

  if (!firstName || firstName.length > 60 || !/^[\p{L}\p{M}]+(?:[ '\u2019.-][\p{L}\p{M}]+)*$/u.test(firstName)) {
    throw new HttpError(400, 'Enter a valid legal first name (up to 60 characters).', 'firstName')
  }
  if (!lastName || lastName.length > 60 || !/^[\p{L}\p{M}]+(?:[ '\u2019.-][\p{L}\p{M}]+)*$/u.test(lastName)) {
    throw new HttpError(400, 'Enter a valid legal last name (up to 60 characters).', 'lastName')
  }
  if (typeof applicant.dateOfBirth !== 'string') {
    throw new HttpError(400, 'Enter a valid date of birth in MM/DD/YYYY format.', 'dateOfBirth')
  }

  const dateMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(applicant.dateOfBirth.trim())
  if (!dateMatch) {
    throw new HttpError(400, 'Enter a valid date of birth in MM/DD/YYYY format.', 'dateOfBirth')
  }

  const [, monthText, dayText, yearText] = dateMatch
  const month = Number(monthText)
  const day = Number(dayText)
  const year = Number(yearText)
  const birthDate = new Date(0)
  birthDate.setFullYear(year, month - 1, day)
  birthDate.setHours(0, 0, 0, 0)

  if (
    year < 1 ||
    birthDate.getFullYear() !== year ||
    birthDate.getMonth() !== month - 1 ||
    birthDate.getDate() !== day
  ) {
    throw new HttpError(400, 'Enter a real calendar date for date of birth.', 'dateOfBirth')
  }
  if (birthDate > new Date()) {
    throw new HttpError(400, 'Date of birth cannot be in the future.', 'dateOfBirth')
  }
  const age = ageFromDate(birthDate)
  if (age < MIN_APPLICANT_AGE || age > MAX_APPLICANT_AGE) {
    throw new HttpError(
      422,
      `Applicant is not eligible based on age. Eligible ages are ${MIN_APPLICANT_AGE}–${MAX_APPLICANT_AGE}.`,
      'dateOfBirth',
    )
  }
  if (!GENDERS.has(applicant.gender)) {
    throw new HttpError(400, 'Select a valid gender.', 'gender')
  }

  const zipCode = typeof applicant.zipCode === 'string' ? applicant.zipCode.trim() : ''
  if (!/^\d{5}(?:-\d{4})?$/.test(zipCode)) {
    throw new HttpError(400, 'Enter a valid US ZIP code or ZIP+4.', 'zipCode')
  }
  if (!isCaliforniaZip(zipCode)) {
    throw new HttpError(
      422,
      "We're not currently offering this product in that state.",
      'zipCode',
    )
  }
  if (!['Yes', 'No'].includes(applicant.tobaccoUse)) {
    throw new HttpError(400, 'Select yes or no for tobacco use.', 'tobaccoUse')
  }

  return {
    firstName,
    lastName,
    dateOfBirth: applicant.dateOfBirth.trim(),
    gender: applicant.gender,
    zipCode,
    tobaccoUse: applicant.tobaccoUse,
  }
}

function monthlyPremiumCents(rate, coverageAmount) {
  return Math.round((coverageAmount / 1000) * rate.monthlyRateCentsPerThousand)
}

function rateOptionForCoverage(rate, coverageAmount) {
  if (coverageAmount > rate.maxCoverageAmount) {
    return {
      id: rate.id,
      label: rate.label,
      monthlyRateCentsPerThousand: rate.monthlyRateCentsPerThousand,
      available: false,
      coverageAmount: null,
      monthlyPremiumCents: null,
      annualPremiumCents: null,
    }
  }

  const monthly = monthlyPremiumCents(rate, coverageAmount)
  return {
    id: rate.id,
    label: rate.label,
    monthlyRateCentsPerThousand: rate.monthlyRateCentsPerThousand,
    available: true,
    coverageAmount,
    monthlyPremiumCents: monthly,
    annualPremiumCents: monthly * 12,
  }
}

function rateOptionForTargetPremium(rate, targetMonthlyPremiumCents) {
  let closestOption = null
  let closestDifference = Number.POSITIVE_INFINITY

  for (
    let coverageAmount = MIN_COVERAGE_AMOUNT;
    coverageAmount <= rate.maxCoverageAmount;
    coverageAmount += COVERAGE_INCREMENT
  ) {
    const option = rateOptionForCoverage(rate, coverageAmount)
    const difference = Math.abs(option.monthlyPremiumCents - targetMonthlyPremiumCents)

    if (
      difference < closestDifference ||
      (difference === closestDifference && coverageAmount < closestOption.coverageAmount)
    ) {
      closestOption = option
      closestDifference = difference
    }
  }

  return {
    ...closestOption,
    targetDifferenceCents: closestDifference,
  }
}

function calculateQuote(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'A quote request is required.')
  }

  const applicant = validateApplicant(body.applicant)
  const quoteBy = body.quoteBy ?? 'coverage'
  if (!['coverage', 'monthlyPremium'].includes(quoteBy)) {
    throw new HttpError(400, 'Choose coverage or monthly premium as the quote mode.')
  }

  const selectedRateClass = RATE_CLASSES.find((rate) => rate.id === body.rateClass)
  if (!selectedRateClass) throw new HttpError(400, 'Select a valid rate class.')
  if (!['monthly', 'annual'].includes(body.billingFrequency)) {
    throw new HttpError(400, 'Select monthly or annual billing.')
  }

  let coverageAmount = null
  let targetMonthlyPremiumCents = null
  let rateOptions

  if (quoteBy === 'coverage') {
    coverageAmount = body.coverageAmount
    if (
      !Number.isInteger(coverageAmount) ||
      coverageAmount < MIN_COVERAGE_AMOUNT ||
      coverageAmount > 50000
    ) {
      throw new HttpError(400, 'Coverage must be a whole amount between $1,000 and $50,000.')
    }
    if (coverageAmount % COVERAGE_INCREMENT !== 0) {
      throw new HttpError(400, 'Choose coverage in $1,000 increments.')
    }

    rateOptions = RATE_CLASSES.map((rate) => rateOptionForCoverage(rate, coverageAmount))
  } else {
    targetMonthlyPremiumCents = body.targetMonthlyPremiumCents
    if (
      !Number.isInteger(targetMonthlyPremiumCents) ||
      targetMonthlyPremiumCents < 100 ||
      targetMonthlyPremiumCents > MAX_MONTHLY_TARGET_CENTS
    ) {
      throw new HttpError(400, 'Monthly premium must be between $1.00 and $500.00.')
    }

    rateOptions = RATE_CLASSES.map((rate) =>
      rateOptionForTargetPremium(rate, targetMonthlyPremiumCents),
    )
  }

  const selectedOption = rateOptions.find((option) => option.id === selectedRateClass.id)

  return {
    applicant,
    quoteBy,
    coverageAmount: selectedOption.available ? selectedOption.coverageAmount : coverageAmount,
    targetMonthlyPremiumCents,
    selectedRateClass: selectedRateClass.id,
    billingFrequency: body.billingFrequency,
    rateOptions,
    disclaimer: 'Illustrative demo rates only. Not an insurance offer.',
  }
}

async function readJsonBody(request) {
  let byteCount = 0
  const chunks = []

  for await (const chunk of request) {
    byteCount += chunk.length
    if (byteCount > MAX_BODY_BYTES) {
      throw new HttpError(413, 'Request body is too large.')
    }
    chunks.push(chunk)
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON.')
  }
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  })
  response.end(JSON.stringify(payload))
}

async function serveFrontend(request, response) {
  let pathname
  try {
    pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
  } catch {
    throw new HttpError(400, 'Invalid URL path.')
  }

  const requestedFile = resolve(DIST_DIRECTORY, `.${pathname}`)
  if (requestedFile !== DIST_DIRECTORY && !requestedFile.startsWith(`${DIST_DIRECTORY}${sep}`)) {
    throw new HttpError(400, 'Invalid URL path.')
  }

  let filePath = requestedFile
  let content
  try {
    content = await readFile(filePath)
  } catch (error) {
    if (error.code !== 'ENOENT' && error.code !== 'EISDIR') throw error
    if (extname(pathname)) {
      throw new HttpError(404, 'File not found.')
    }
    filePath = resolve(DIST_DIRECTORY, 'index.html')
    try {
      content = await readFile(filePath)
    } catch (indexError) {
      if (indexError.code === 'ENOENT') {
        throw new HttpError(503, 'The frontend has not been built yet.')
      }
      throw indexError
    }
  }

  response.writeHead(200, {
    'Cache-Control': filePath === resolve(DIST_DIRECTORY, 'index.html')
      ? 'no-cache'
      : 'public, max-age=3600',
    'Content-Length': content.length,
    'Content-Type': CONTENT_TYPES[extname(filePath)] || 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
  })
  response.end(request.method === 'HEAD' ? undefined : content)
}

export function createApiServer({ serveBuiltFrontend = false } = {}) {
  const savedQuotes = new Map()

  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost')

      if (serveBuiltFrontend && ['GET', 'HEAD'].includes(request.method) && !url.pathname.startsWith('/api/')) {
        await serveFrontend(request, response)
        return
      }

      if (request.method === 'GET' && url.pathname === '/api/health') {
        sendJson(response, 200, { status: 'ok' })
        return
      }

      if (request.method === 'POST' && url.pathname === '/api/eligibility') {
        const body = await readJsonBody(request)
        const applicant = validateApplicant(body?.applicant)
        sendJson(response, 200, {
          eligible: true,
          age: ageFromDate(new Date(
            Number(applicant.dateOfBirth.slice(6, 10)),
            Number(applicant.dateOfBirth.slice(0, 2)) - 1,
            Number(applicant.dateOfBirth.slice(3, 5)),
          )),
          state: 'CA',
        })
        return
      }

      if (request.method === 'GET' && url.pathname.startsWith('/api/quotes/')) {
        const quoteId = url.pathname.slice('/api/quotes/'.length)
        const savedQuote = savedQuotes.get(quoteId)
        if (!savedQuote) throw new HttpError(404, 'Demo quote not found.')
        sendJson(response, 200, savedQuote)
        return
      }

      if (
        request.method === 'POST' &&
        (url.pathname === '/api/quotes/estimate' || url.pathname === '/api/quotes')
      ) {
        const body = await readJsonBody(request)
        const quote = calculateQuote(body)

        if (url.pathname === '/api/quotes/estimate') {
          sendJson(response, 200, quote)
          return
        }

        const savedQuote = {
          ...quote,
          quoteId: randomUUID(),
          createdAt: new Date().toISOString(),
        }
        savedQuotes.set(savedQuote.quoteId, savedQuote)
        sendJson(response, 201, savedQuote)
        return
      }

      if (url.pathname.startsWith('/api/')) {
        throw new HttpError(404, 'API endpoint not found.')
      }

      sendJson(response, 404, { message: 'Not found.' })
    } catch (error) {
      if (error instanceof HttpError) {
        sendJson(response, error.status, { message: error.message, field: error.field })
        return
      }

      sendJson(response, 500, { message: 'An unexpected error occurred.' })
      console.error('API request failed:', error)
    }
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT || process.env.API_PORT || 3001)
  const server = createApiServer({
    serveBuiltFrontend: process.env.NODE_ENV === 'production',
  })
  server.listen(port, '0.0.0.0', () => {
    console.log(`Demo quote API listening on http://localhost:${port}`)
  })
}
