const core = require('@actions/core')
const exec = require('@actions/exec')
const Heroku = require('heroku-client')
const fetch = require('node-fetch-cjs')
const { FormData } = require('formdata-polyfill/esm.min.js')

const domain = core.getInput('DOMAIN')
const subdomain = core.getInput('SUBDOMAIN')
const heroku = new Heroku({ token: core.getInput('HEROKU_API_TOKEN') })
const namecheap = {
  username: core.getInput('NAMECHEAP_USERNAME'),
  key: core.getInput('NAMECHEAP_API_KEY'),
}

async function run() {

  // create heroku app
  console.log('creating app', 'post', '/apps', { body: { name: subdomain } })
  let app
  try {
    app = await heroku.post(
      '/apps',
      { body: { name: subdomain } }
    )
  } catch (error) {
    console.error(error)
    throw error
  }

  console.log('app created', app)

  // add domain to heroku app
  console.log('adding domain', 'post', `/apps/${app.name}/domains`, { body: { hostname: `${app.name}.${domain}`, sni_endpoint: null } })
  const d = await heroku.post(
    `/apps/${app.name}/domains`,
    { body: { hostname: `${app.name}.${domain}`, sni_endpoint: null } }
  )
  console.log('added domain', d)

  // get external IP
  console.log('getting IP')
  const { stdout: ip } = await exec.getExecOutput(
    'dig',
    ['+short', 'myip.opendns.com', '@resolver1.opendns.com'],
    { silent: true }
  )
  console.log('got IP', ip)

  // add CNAME record to namecheap
  const { cname } = d
  const [sld, tld] = domain.split('.')
  const body = Object.entries({
    apiuser: namecheap.username,
    apikey: namecheap.key,
    username: namecheap.username,
    Command: 'namecheap.domains.dns.setHosts',
    ClientIp: ip.trim(),
    SLD: sld,
    TLD: tld,
    HostName1: app.name,
    RecordType1: 'CNAME',
    Address1: cname,
    TTL1: 100
  }).reduce((acc, [key, val]) => {
    acc.append(key, val)
    return acc
  }, new FormData())

  const args = [
    "https://api.namecheap.com/xml.response",
    {
      method: 'POST',
      body
    }
  ]

  console.log('adding cname record', args)
  const response = await fetch(...args)
  const result = await response.text()
  console.log('added cname record', result)

  core.setOutput('url', `http://${app.name}.${domain}`)
}

run()
