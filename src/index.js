const {
  BaseKonnector,
  scrape,
  saveBills,
  log,
  requestFactory
} = require('cozy-konnector-libs')
const requestHTML = requestFactory({
  cheerio: true,
  json: false,
  jar: true
})
const requestJSON = requestFactory({
  cheerio: false,
  json: true,
  jar: true
})
const URL = require('url').URL
const moment = require('moment')
moment.locale('fr')

const baseURL = new URL('https://deliveroo.fr/fr/login')

module.exports = new BaseKonnector(start)

async function start(fields) {
  log('info', 'Authenticating ...')
  await authenticate(fields.login, fields.password)
  log('info', 'Successfully logged in')
  log('info', 'Fetching the list of documents')
  const $ = await requestHTML({
    uri: `${baseURL.origin}/fr/orders`
  })
  log('info', 'Parsing list of documents')
  const documents = await parseDocuments($)

  log('info', 'Saving data to Cozy')
  await saveBills(documents, fields.folderPath, {
    identifiers: ['deliveroo']
  })
}

async function authenticate(username, password) {
  const options = {
    formselector: 'form#login',
    input: {
      input_login_name: 'login_email',
      input_password_name: 'login_password'
    },
    username,
    password,
    generateHeader: $ => ({
      'x-csrf-token': $('meta[name="csrf-token"]').attr('content'),
      'content-type': 'application/json;charset=UTF-8'
    }),
    parse: 'json',
    validate: json => json && json.user.id
  }

  return await signin(options)
}

async function signin({
  formselector = 'form',
  input = { input_login_name: 'email', input_password_name: 'password' },
  username,
  password,
  generateHeader = () => ({}),
  validate = () => false
}) {
  const loginurl = baseURL.href
  const $ = await requestHTML(loginurl)
  const formaction = $(formselector).attr('action')
  const formurl = `${baseURL.origin}${formaction}`
  const form = {
    [$(`form input[name="${input.input_login_name}"]`).attr(
      'inputmode'
    )]: username,
    [$(`form input[name="${input.input_password_name}"]`).attr(
      'inputmode'
    )]: password
  }
  const headers = generateHeader($)
  const json = await requestJSON({
    method: 'POST',
    uri: formurl,
    form,
    headers
  })
  return validate(json)
}

function parseDocuments($) {
  const docs = scrape(
    $,
    {
      title: {
        sel:
          'a:nth-child(1) > span:nth-child(1) > span:nth-child(2) > span:nth-child(1)'
      },
      amount: {
        sel:
          'a:nth-child(1) > span:nth-child(1) > span:nth-child(4) > span:nth-child(1)',
        parse: text => parseFloat(/\d+,\d?/.exec(text)[0])
      },
      date: {
        sel: 'a:nth-child(1) > span:nth-child(1) > span:nth-child(3)',
        parse: text => moment(text, 'D MMMM YYYY HH:mm').toDate()
      },
      numero: {
        sel: 'a',
        attr: 'href',
        parse: src => src.split('/').pop()
      }
    },
    'ul.results-list li:has(.status-delivered)'
  )
  return docs.map(doc => ({
    ...doc,
    currency: 'EUR',
    vendor: 'deliveroo',
    metadata: {
      importDate: new Date(),
      version: 1
    },
    fileurl: `${baseURL.origin}/order/receipt/${doc.numero}`,
    filename: `${doc.title.replace(' ', '-')}-${doc.numero}-${
      doc.amount
    }-EUR.pdf`
  }))
}
