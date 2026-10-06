import { useEffect, useRef, useState } from 'react'
import './App.css'

const initialValues = {
  firstName: '',
  lastName: '',
  dateOfBirth: '',
  gender: '',
  zipCode: '',
  tobaccoUse: '',
}

const MIN_APPLICANT_AGE = 50
const MAX_APPLICANT_AGE = 85

const rateClassLabels = {
  'level-preferred': 'Level Preferred',
  'level-non-tobacco': 'Level Non-Tobacco',
  'modified-non-tobacco': 'Modified Non-Tobacco',
}

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
})

function validateName(value, label) {
  const name = value.trim()
  if (!name) return `${label} is required.`
  if (name.length > 60) return `${label} must be 60 characters or fewer.`
  if (!/^[\p{L}\p{M}]+(?:[ '\u2019.-][\p{L}\p{M}]+)*$/u.test(name)) {
    return 'Use letters, spaces, apostrophes, periods, or hyphens only.'
  }
  return ''
}

function validateDateOfBirth(value) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim())
  if (!match) return 'Enter a valid date in MM/DD/YYYY format.'

  const [, monthText, dayText, yearText] = match
  const month = Number(monthText)
  const day = Number(dayText)
  const year = Number(yearText)
  const date = new Date(0)
  date.setFullYear(year, month - 1, day)
  date.setHours(0, 0, 0, 0)

  if (
    year < 1 ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return 'Enter a real calendar date.'
  }

  const today = new Date()
  const isFutureDate =
    year > today.getFullYear() ||
    (year === today.getFullYear() && month > today.getMonth() + 1) ||
    (year === today.getFullYear() && month === today.getMonth() + 1 && day > today.getDate())

  if (isFutureDate) return 'Date of birth cannot be in the future.'

  const age = getAge(value)
  if (age < MIN_APPLICANT_AGE || age > MAX_APPLICANT_AGE) {
    return `Applicant is not eligible based on age. Eligible ages are ${MIN_APPLICANT_AGE}–${MAX_APPLICANT_AGE}.`
  }
  return ''
}

function isCaliforniaZip(value) {
  const zip = Number(value.slice(0, 5))
  return zip >= 90001 && zip <= 96162
}

function validateApplicant(values) {
  const zipCode = values.zipCode.trim()
  return {
    firstName: validateName(values.firstName, 'First name'),
    lastName: validateName(values.lastName, 'Last name'),
    dateOfBirth: validateDateOfBirth(values.dateOfBirth),
    gender: values.gender ? '' : 'Select a gender.',
    zipCode: !zipCode
      ? 'ZIP code is required.'
      : !/^\d{5}(?:-\d{4})?$/.test(zipCode)
        ? 'Enter a valid 5-digit ZIP code or ZIP+4.'
        : !isCaliforniaZip(zipCode)
          ? "We're not currently offering this product in that state."
          : '',
    tobaccoUse: values.tobaccoUse ? '' : 'Select yes or no.',
  }
}

function validateCoverage(value) {
  const amount = Number(value)
  if (!value || !Number.isInteger(amount)) return 'Enter a whole-dollar coverage amount.'
  if (amount < 1000 || amount > 50000) return 'Coverage must be between $1,000 and $50,000.'
  if (amount % 1000 !== 0) return 'Choose coverage in $1,000 increments.'
  return ''
}

function validateMonthlyPremium(value) {
  const amount = Number(value)
  if (!value || !Number.isFinite(amount)) return 'Enter a monthly premium.'
  if (amount < 1 || amount > 500) return 'Premium must be between $1 and $500.'
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return 'Enter an amount with up to two decimal places.'
  return ''
}

function Icon({ name, size = 18 }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  }

  const shapes = {
    external: <><path d="M14 4h6v6" /><path d="m20 4-9 9" /><path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" /></>,
    chart: <><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-5 5" /></>,
    chevron: <path d="m9 18 6-6-6-6" />,
    chevronUp: <path d="m18 15-6-6-6 6" />,
    chevronDown: <path d="m6 9 6 6 6-6" />,
    check: <path d="m5 12 4 4L19 6" />,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
    close: <><path d="m18 6-12 12M6 6l12 12" /></>,
    next: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
    back: <><path d="M19 12H5" /><path d="m11 18-6-6 6-6" /></>,
  }

  return <svg {...common}>{shapes[name]}</svg>
}

function QuoteForm({ values, onValuesChange, onContinue }) {
  const [touched, setTouched] = useState({})
  const [submitted, setSubmitted] = useState(false)
  const [serverErrors, setServerErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [isContinuing, setIsContinuing] = useState(false)
  const firstNameRef = useRef(null)

  const errors = validateApplicant(values)
  const visibleError = (name) => serverErrors[name] || errors[name]
  const showError = (name) =>
    (touched[name] || submitted || serverErrors[name]) && visibleError(name)

  function updateValue(name, value) {
    onValuesChange((current) => ({ ...current, [name]: value }))
    setServerErrors((current) => {
      const remaining = { ...current }
      delete remaining[name]
      return remaining
    })
    setFormError('')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitted(true)
    const firstInvalidField = Object.keys(errors).find((name) => errors[name])

    if (firstInvalidField) {
      if (firstInvalidField === 'tobaccoUse') {
        document.getElementById('tobacco-yes')?.focus()
      } else if (firstInvalidField === 'firstName') {
        firstNameRef.current?.focus()
      } else {
        document.getElementById(firstInvalidField)?.focus()
      }
      return
    }

    setFormError('')
    setServerErrors({})
    setIsContinuing(true)
    try {
      const response = await fetch('/api/eligibility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicant: values }),
      })
      const result = await response.json()

      if (!response.ok) {
        if (result.field) {
          setServerErrors({ [result.field]: result.message })
          setTouched((current) => ({ ...current, [result.field]: true }))
          document.getElementById(result.field)?.focus()
        } else {
          setFormError(result.message || 'Could not check applicant eligibility.')
        }
        return
      }

      await new Promise((resolve) => window.setTimeout(resolve, 450))
      onContinue(values)
    } catch {
      setFormError('Could not check eligibility. Please check your connection and try again.')
    } finally {
      setIsContinuing(false)
    }
  }

  function fieldClass(name) {
    return `form-field${showError(name) ? ' has-error' : ''}`
  }

  function fieldLabel(name, text) {
    return (
      <label className="floating-label" htmlFor={name}>
        {text}<span aria-hidden="true">*</span>
      </label>
    )
  }

  function errorMessage(name) {
    return showError(name) ? (
      <span className="field-error" id={`${name}-error`}>
        {visibleError(name)}
      </span>
    ) : null
  }

  return (
    <div className="quote-entry-page">
      <PortalHeader applicant={values} />
      <main className="quote-entry-main">
        <h1 className="page-title">Get a quote</h1>
        <form className="quote-entry-card" id="applicant-form" noValidate onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className={fieldClass('firstName')}>
            {fieldLabel('firstName', 'Legal First Name')}
            <input
              autoComplete="given-name"
              id="firstName"
              maxLength={61}
              onBlur={() => setTouched((current) => ({ ...current, firstName: true }))}
              onChange={(event) => updateValue('firstName', event.target.value)}
              ref={firstNameRef}
              aria-describedby={showError('firstName') ? 'firstName-error' : undefined}
              aria-invalid={Boolean(showError('firstName'))}
              required
              value={values.firstName}
            />
            {errorMessage('firstName')}
          </div>

          <div className={fieldClass('lastName')}>
            {fieldLabel('lastName', 'Legal Last Name')}
            <input
              autoComplete="family-name"
              id="lastName"
              maxLength={61}
              onBlur={() => setTouched((current) => ({ ...current, lastName: true }))}
              onChange={(event) => updateValue('lastName', event.target.value)}
              aria-describedby={showError('lastName') ? 'lastName-error' : undefined}
              aria-invalid={Boolean(showError('lastName'))}
              required
              value={values.lastName}
            />
            {errorMessage('lastName')}
          </div>

          <div className={fieldClass('dateOfBirth')}>
            {fieldLabel('dateOfBirth', 'Date of Birth')}
            <input
              autoComplete="bday"
              id="dateOfBirth"
              inputMode="numeric"
              maxLength={10}
              onBlur={() => setTouched((current) => ({ ...current, dateOfBirth: true }))}
              onChange={(event) => updateValue('dateOfBirth', event.target.value)}
              placeholder="MM/DD/YYYY"
              aria-describedby={showError('dateOfBirth') ? 'dateOfBirth-error' : undefined}
              aria-invalid={Boolean(showError('dateOfBirth'))}
              required
              value={values.dateOfBirth}
            />
            {errorMessage('dateOfBirth')}
          </div>

          <div className={fieldClass('gender')}>
            {fieldLabel('gender', 'Gender (At Birth)')}
            <select
              id="gender"
              onBlur={() => setTouched((current) => ({ ...current, gender: true }))}
              onChange={(event) => updateValue('gender', event.target.value)}
              aria-describedby={showError('gender') ? 'gender-error' : undefined}
              aria-invalid={Boolean(showError('gender'))}
              required
              value={values.gender}
            >
              <option disabled value="">Select gender</option>
              <option value="Female">Female</option>
              <option value="Male">Male</option>
            </select>
            {errorMessage('gender')}
          </div>

          <div className={`${fieldClass('zipCode')} zip-field`}>
            {fieldLabel('zipCode', 'Residence Zip Code')}
            <input
              autoComplete="postal-code"
              id="zipCode"
              inputMode="numeric"
              maxLength={10}
              onBlur={() => setTouched((current) => ({ ...current, zipCode: true }))}
              onChange={(event) => updateValue('zipCode', event.target.value)}
              aria-describedby={showError('zipCode') ? 'zipCode-error' : undefined}
              aria-invalid={Boolean(showError('zipCode'))}
              required
              value={values.zipCode}
            />
            <span
              className={`zip-hint${showError('zipCode') ? ' zip-hint-error' : ''}`}
              id={showError('zipCode') ? 'zipCode-error' : undefined}
              role={showError('zipCode') ? 'alert' : undefined}
            >
              {showError('zipCode')
                ? visibleError('zipCode')
                : isCaliforniaZip(values.zipCode.trim())
                  ? <>CA — California <span>(from ZIP)</span></>
                  : values.zipCode.trim().length >= 5
                    ? "We're not currently offering this product in that state."
                    : <>CA ZIP codes only <span>(from ZIP)</span></>}
            </span>
          </div>

          <fieldset
            aria-describedby={showError('tobaccoUse') ? 'tobaccoUse-error' : undefined}
            className={`tobacco-field${showError('tobaccoUse') ? ' has-error' : ''}`}
          >
            <legend>
              Have you used tobacco in any form in the last 12 months?
              <button
                aria-label="More information about tobacco use"
                className="info-button"
                title="Include cigarettes, cigars, vaping, and other tobacco or nicotine products."
                type="button"
              >
                <Icon name="info" size={16} />
              </button>
              <span className="required-mark" aria-hidden="true">*</span>
            </legend>
            <div className="choice-group" aria-describedby={showError('tobaccoUse') ? 'tobaccoUse-error' : undefined}>
              {['Yes', 'No'].map((answer) => (
                <label className={`choice-button${values.tobaccoUse === answer ? ' selected' : ''}`} key={answer}>
                  <input
                    checked={values.tobaccoUse === answer}
                    id={answer === 'Yes' ? 'tobacco-yes' : 'tobacco-no'}
                    name="tobaccoUse"
                    onBlur={() => setTouched((current) => ({ ...current, tobaccoUse: true }))}
                    onChange={() => updateValue('tobaccoUse', answer)}
                    required
                    type="radio"
                    value={answer}
                  />
                  {answer}
                </label>
              ))}
            </div>
            {errorMessage('tobaccoUse')}
          </fieldset>
        </div>

          {formError && <p className="form-error-banner" role="alert">{formError}</p>}
        </form>
      </main>
      <footer className="portal-footer entry-footer">
        <span />
        <button className="next-button" disabled={isContinuing} form="applicant-form" type="submit">
          {isContinuing
            ? <><span aria-hidden="true" className="loading-spinner" /> Checking eligibility…</>
            : <>Next <Icon name="next" size={18} /></>}
        </button>
        <span aria-hidden="true" className="mobile-handle" />
      </footer>
    </div>
  )
}

function getAge(dateOfBirth) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dateOfBirth)
  if (!match) return null

  const [, monthText, dayText, yearText] = match
  const month = Number(monthText)
  const day = Number(dayText)
  const year = Number(yearText)
  const birthDate = new Date(0)
  birthDate.setFullYear(year, month - 1, day)
  birthDate.setHours(0, 0, 0, 0)

  if (
    birthDate.getFullYear() !== year ||
    birthDate.getMonth() !== month - 1 ||
    birthDate.getDate() !== day
  ) {
    return null
  }

  const today = new Date()
  let age = today.getFullYear() - year
  if (
    today.getMonth() < birthDate.getMonth() ||
    (today.getMonth() === birthDate.getMonth() && today.getDate() < day)
  ) {
    age -= 1
  }
  return age
}

function ApplicantSummary({ applicant }) {
  const genderAbbreviation = {
    Female: 'F',
    Male: 'M',
  }[applicant.gender]

  const age = applicant.dateOfBirth ? getAge(applicant.dateOfBirth) : null
  const name = [applicant.firstName.trim(), applicant.lastName.trim()].filter(Boolean).join(' ')

  if (!name && age === null && !genderAbbreviation) return null

  return (
    <span className="applicant-summary">
      {[name, age, genderAbbreviation].filter((value) => value !== null && value !== '').join(' / ')}
    </span>
  )
}

function PortalHeader({ applicant }) {
  return (
    <header className="portal-header">
      <a aria-label="NewBridge home" className="newbridge-logo" href="#quote" onClick={(event) => event.preventDefault()}>
        <span>NewBridge</span><sup>™</sup>
      </a>
      <div className="portal-actions">
        <ApplicantSummary applicant={applicant} />
        <div className="application-id"><strong>ARCF26272h445</strong><span>Application ID Number</span></div>
        <button className="header-pill outline-pill" type="button">Product Guide</button>
        <a className="header-pill" href="mailto:support@example.com">Contact Support</a>
        <button className="advisor-pill" type="button">Ricky Ricardo <Icon name="external" size={15} /></button>
      </div>
    </header>
  )
}

function GuideDialog({ title, onClose, children }) {
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div className="dialog-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section aria-labelledby="dialog-title" aria-modal="true" className="guide-dialog" role="dialog">
        <div className="dialog-heading">
          <h2 id="dialog-title">{title}</h2>
          <button aria-label="Close dialog" className="dialog-close" onClick={onClose} type="button">
            <Icon name="close" size={19} />
          </button>
        </div>
        {children}
      </section>
    </div>
  )
}

function QuoteBuilder({ applicant, onBack }) {
  const [quoteBy, setQuoteBy] = useState('coverage')
  const [coverageInput, setCoverageInput] = useState('35000')
  const [monthlyPremiumInput, setMonthlyPremiumInput] = useState('77')
  const [rateClass, setRateClass] = useState('level-preferred')
  const [billingFrequency, setBillingFrequency] = useState('monthly')
  const [estimate, setEstimate] = useState(null)
  const [estimateStatus, setEstimateStatus] = useState('loading')
  const [estimateError, setEstimateError] = useState('')
  const [quoteId, setQuoteId] = useState('')
  const [finalizeStatus, setFinalizeStatus] = useState('idle')
  const [dialog, setDialog] = useState('')
  const amountError = quoteBy === 'coverage'
    ? validateCoverage(coverageInput)
    : validateMonthlyPremium(monthlyPremiumInput)

  function setQuoteMode(mode) {
    setQuoteBy(mode)
    setEstimate(null)
    setEstimateError('')
    setEstimateStatus('loading')
    setFinalizeStatus('idle')
    setQuoteId('')
  }

  function updateCoverage(value) {
    setCoverageInput(value)
    setEstimate(null)
    setEstimateError('')
    setEstimateStatus(quoteBy === 'coverage' && validateCoverage(value) ? 'idle' : 'loading')
    setFinalizeStatus('idle')
    setQuoteId('')
  }

  function updateMonthlyPremium(value) {
    setMonthlyPremiumInput(value)
    setEstimate(null)
    setEstimateError('')
    setEstimateStatus(quoteBy === 'monthlyPremium' && validateMonthlyPremium(value) ? 'idle' : 'loading')
    setFinalizeStatus('idle')
    setQuoteId('')
  }

  function updateBillingFrequency(value) {
    setBillingFrequency(value)
    setFinalizeStatus('idle')
    setQuoteId('')
  }

  useEffect(() => {
    if (amountError) return undefined

    const controller = new AbortController()
    const quoteRequest = {
      applicant,
      quoteBy,
      rateClass,
      billingFrequency: 'monthly',
      ...(quoteBy === 'coverage'
        ? { coverageAmount: Number(coverageInput) }
        : { targetMonthlyPremiumCents: Math.round(Number(monthlyPremiumInput) * 100) }),
    }

    async function requestEstimate() {
      try {
        const response = await fetch('/api/quotes/estimate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify(quoteRequest),
        })
        const result = await response.json()

        if (!response.ok) {
          throw new Error(result.message || 'Could not calculate an estimate.')
        }
        setEstimate(result)
        setEstimateStatus('ready')
      } catch (error) {
        if (error.name !== 'AbortError') {
          setEstimateError(error.message)
          setEstimateStatus('error')
        }
      }
    }

    requestEstimate()
    return () => controller.abort()
  }, [applicant, amountError, coverageInput, monthlyPremiumInput, quoteBy, rateClass])

  async function finalizeQuote() {
    if (amountError || estimateStatus !== 'ready') return

    setFinalizeStatus('saving')
    try {
      const response = await fetch('/api/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicant,
          quoteBy,
          rateClass,
          billingFrequency,
          ...(quoteBy === 'coverage'
            ? { coverageAmount: Number(coverageInput) }
            : { targetMonthlyPremiumCents: Math.round(Number(monthlyPremiumInput) * 100) }),
        }),
      })
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.message || 'Could not prepare your quote.')
      }
      setQuoteId(result.quoteId)
      setFinalizeStatus('saved')
    } catch (error) {
      setEstimateError(error.message)
      setFinalizeStatus('error')
    }
  }

  const selectedRate = estimate?.rateOptions.find((option) => option.id === rateClass)
  const displayedPremium = selectedRate?.available
    ? selectedRate[`${billingFrequency}PremiumCents`] / 100
    : null
  const displayedCoverage = selectedRate?.available ? selectedRate.coverageAmount : null

  return (
    <div className="quote-builder-page">
      <header className="portal-header">
        <a aria-label="NewBridge home" className="newbridge-logo" href="#quote" onClick={(event) => event.preventDefault()}>
          <span>NewBridge</span><sup>™</sup>
        </a>
        <div className="portal-actions">
          <ApplicantSummary applicant={applicant} />
          <div className="application-id"><strong>DEMO{getAge(applicant.dateOfBirth)}042</strong><span>Application ID Number</span></div>
          <button className="header-pill outline-pill" onClick={() => setDialog('product')} type="button">Product Guide</button>
          <a className="header-pill" href="mailto:support@example.com">Contact Support</a>
          <button className="advisor-pill" onClick={() => setDialog('support')} type="button">Ricky Ricardo <Icon name="external" size={15} /></button>
        </div>
      </header>

      <main className="quote-builder-main">
        <h1 className="quote-screen-title">Quote</h1>
        <section aria-labelledby="quote-title" className="quote-workspace">
          <h2 id="quote-title" className="workspace-title">Your Applicant&apos;s NewBridge Final Expense Insurance Quote</h2>

          <div className="quote-columns">
            <div className="quote-left-column">
              <section aria-labelledby="builder-heading" className="builder-card">
                <div className="builder-card-heading">
                  <h2 id="builder-heading">Quote Builder</h2>
                  <div aria-label="Quote calculation mode" className="quote-mode">
                    <span>QUOTE BY</span>
                    <button
                      aria-pressed={quoteBy === 'coverage'}
                      className={quoteBy === 'coverage' ? 'is-active' : ''}
                      onClick={() => setQuoteMode('coverage')}
                      type="button"
                    >
                      Coverage
                    </button>
                    <button
                      aria-pressed={quoteBy === 'monthlyPremium'}
                      className={quoteBy === 'monthlyPremium' ? 'is-active' : ''}
                      onClick={() => setQuoteMode('monthlyPremium')}
                      type="button"
                    >
                      Monthly Premium
                    </button>
                  </div>
                </div>

                <div className="builder-controls">
                  <div className="coverage-control">
                    <label htmlFor="quote-amount">{quoteBy === 'coverage' ? 'Amount' : 'Base Premium'}</label>
                    <div className={`amount-input${amountError ? ' has-error' : ''}`}>
                      <span aria-hidden="true">$</span>
                      <input
                        aria-describedby={amountError ? 'quote-amount-error' : undefined}
                        aria-invalid={Boolean(amountError)}
                        id="quote-amount"
                        inputMode={quoteBy === 'coverage' ? 'numeric' : 'decimal'}
                        onChange={(event) => {
                          if (quoteBy === 'coverage') updateCoverage(event.target.value)
                          else updateMonthlyPremium(event.target.value)
                        }}
                        type="number"
                        min={quoteBy === 'coverage' ? '1000' : '1'}
                        max={quoteBy === 'coverage' ? '50000' : '500'}
                        step={quoteBy === 'coverage' ? '1000' : '0.01'}
                        value={quoteBy === 'coverage' ? coverageInput : monthlyPremiumInput}
                      />
                    </div>
                    {amountError && <span className="coverage-error" id="quote-amount-error">{amountError}</span>}
                  </div>

                  <div className="rate-control">
                    <div className="rate-toolbar">
                      <span>Rate Class</span>
                      <button className="guide-button" onClick={() => setDialog('chart')} type="button">Build Chart</button>
                      <button className="guide-button guide-primary" onClick={() => setDialog('medication')} type="button">Medication Guide</button>
                    </div>
                    <div className="rate-table">
                      <div className="rate-table-header"><span>RATE CLASS</span><span>{quoteBy === 'coverage' ? 'MONTHLY PREMIUM' : 'COVERAGE'}</span></div>
                      {estimateStatus === 'ready' && estimate?.rateOptions.map((option) => {
                        const amount = quoteBy === 'coverage'
                          ? option.available
                            ? currency.format(option.monthlyPremiumCents / 100)
                            : 'N/A'
                          : option.available
                            ? currency.format(option.coverageAmount)
                            : 'N/A'
                        return (
                          <label className={`rate-option${rateClass === option.id ? ' is-selected' : ''}${option.available ? '' : ' is-unavailable'}`} key={option.id}>
                            <input
                              checked={rateClass === option.id}
                              disabled={!option.available}
                              name="rateClass"
                              onChange={() => {
                                setRateClass(option.id)
                                setEstimateStatus('loading')
                                setEstimateError('')
                                setFinalizeStatus('idle')
                                setQuoteId('')
                              }}
                              type="radio"
                              value={option.id}
                            />
                            <span className="rate-radio" />
                            <span className="rate-name">{option.label}</span>
                            <strong>{amount}</strong>
                          </label>
                        )
                      })}
                      {estimateStatus === 'loading' && <p className="table-message">Calculating sample rates…</p>}
                      {estimateStatus === 'error' && <p className="table-message error-text">{estimateError}</p>}
                      {estimateStatus === 'idle' && !amountError && <p className="table-message">Choose a valid amount to see sample rates.</p>}
                    </div>
                  </div>
                </div>
                <p className="sample-rate-note"><Icon name="info" size={13} /> Illustrative demo rates only. Not an insurance offer. Coverage mode changes premiums; monthly premium mode finds the closest coverage amount.</p>
              </section>

              <section className="rider-placeholder">
                <span className="rider-placeholder-icon"><Icon name="info" size={17} /></span>
                <div><strong>Optional riders aren&apos;t included in this demo</strong><span>Rider pricing and eligibility need approved product rules.</span></div>
              </section>
            </div>

            <aside className="quote-right-column">
              <div className="product-wordmark"><a href="#quote" onClick={(event) => event.preventDefault()}>NewBridge<sup>™</sup></a><span>Final Expense</span></div>
              <section aria-label="Policy total" className="policy-total-card">
                <span className="policy-tag">POLICY TOTAL</span>
                <div className="policy-card-top"><span>TOTAL</span><div className="billing-toggle" aria-label="Premium frequency">
                  <button aria-pressed={billingFrequency === 'monthly'} className={billingFrequency === 'monthly' ? 'selected' : ''} onClick={() => {
                    updateBillingFrequency('monthly')
                  }} type="button">Monthly</button>
                  <button aria-pressed={billingFrequency === 'annual'} className={billingFrequency === 'annual' ? 'selected' : ''} onClick={() => {
                    updateBillingFrequency('annual')
                  }} type="button">Annual</button>
                </div></div>
                <div className="total-premium">
                  {estimateStatus === 'loading' && <span className="premium-loading">Calculating…</span>}
                  {estimateStatus === 'error' && <span className="premium-loading error-text">Unavailable</span>}
                  {displayedPremium !== null && estimateStatus === 'ready' && (
                    <><strong>{currency.format(displayedPremium)}</strong><span>/{billingFrequency === 'monthly' ? 'month' : 'year'}</span></>
                  )}
                </div>
                <div className="policy-detail"><span>Coverage</span><strong>{displayedCoverage === null ? 'N/A' : currency.format(displayedCoverage)}</strong></div>
                <div className="policy-detail"><span>Rate class</span><strong>{rateClassLabels[rateClass]}</strong></div>
                <div className="base-premium"><span>Base premium</span><strong>{displayedPremium === null ? 'N/A' : currency.format(displayedPremium)} <small>/{billingFrequency === 'monthly' ? 'mo' : 'yr'}</small></strong></div>
              </section>

              <section className="included-card">
                <h2>DEMO RATE BASIS</h2>
                <p><span className="included-check"><Icon name="check" size={12} /></span> Sample rate × coverage amount, rounded to cents</p>
                <p className="included-footnote">Applicant details are validated but do not determine the demo rate class.</p>
              </section>
              <p aria-live="polite" className={`quote-status${finalizeStatus === 'error' ? ' error-text' : ''}`}>
                {finalizeStatus === 'saved' ? `Demo quote prepared · ${quoteId}` : finalizeStatus === 'saving' ? 'Preparing your demo quote…' : finalizeStatus === 'error' ? estimateError : ''}
              </p>
            </aside>
          </div>
        </section>
      </main>

      <footer className="portal-footer">
        <button className="back-button" onClick={onBack} type="button"><Icon name="back" size={18} /> Back</button>
        <button
          className="next-button"
          disabled={estimateStatus !== 'ready' || Boolean(amountError) || !selectedRate?.available || finalizeStatus === 'saving' || finalizeStatus === 'saved'}
          onClick={finalizeQuote}
          type="button"
        >
          {finalizeStatus === 'saved' ? 'Quote ready' : finalizeStatus === 'saving' ? 'Preparing…' : 'Next'}
          {finalizeStatus !== 'saved' && <Icon name="next" size={18} />}
        </button>
        <span aria-hidden="true" className="mobile-handle" />
      </footer>

      {dialog === 'chart' && (
        <GuideDialog onClose={() => setDialog('')} title="Sample rate comparison">
          <p className="dialog-copy">Illustrative monthly sample rates per $1,000 of coverage. These simple demo assumptions are not approved insurance prices.</p>
          <div className="comparison-list">
            {estimate?.rateOptions.map((option) => (
              <div className="comparison-item" key={option.id}><span>{option.label}</span><strong>{currency.format(option.monthlyRateCentsPerThousand / 100)} / $1,000 / month</strong></div>
            ))}
          </div>
        </GuideDialog>
      )}
      {dialog === 'medication' && (
        <GuideDialog onClose={() => setDialog('')} title="Medication guide">
          <p className="dialog-copy">Medication lists and medical underwriting rules are not implemented in this demo. No medication or health information is collected or used to calculate these sample rates.</p>
        </GuideDialog>
      )}
      {dialog === 'product' && (
        <GuideDialog onClose={() => setDialog('')} title="Product guide">
          <p className="dialog-copy">Explore sample coverage amounts and compare illustrative rate classes. Premiums shown are a frontend demo and aren&apos;t a quote, offer, or representation of an insurer&apos;s rates.</p>
        </GuideDialog>
      )}
      {dialog === 'support' && (
        <GuideDialog onClose={() => setDialog('')} title="Advisor">
          <p className="dialog-copy">Ricky Ricardo is a placeholder advisor for this demo. Contact details and advisor services have not been configured.</p>
        </GuideDialog>
      )}
    </div>
  )
}

function App() {
  const [formValues, setFormValues] = useState(initialValues)
  const [applicant, setApplicant] = useState(null)

  return applicant
    ? <QuoteBuilder applicant={applicant} onBack={() => setApplicant(null)} />
    : <QuoteForm
        onContinue={setApplicant}
        onValuesChange={setFormValues}
        values={formValues}
      />
}

export default App
