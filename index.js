const core = require('@actions/core')
const Heroku = require('heroku-client')
const { default: fetch } = require('node-fetch-cjs')

const domain = core.getInput('DOMAIN')
const subdomain = core.getInput('SUBDOMAIN')
const heroku = new Heroku({ token: core.getInput('HEROKU_API_TOKEN') })
const cloudflare = {
  token: core.getInput('CLOUDFLARE_TOKEN'),
  zone: core.getInput('CLOUDFLARE_ZONE'),
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
    console.log('app created', app)
  } catch (error) {
    if (error.statusCode !== 422) {
      console.error(error)
      throw error
    }
    if (error.body.message !== `Name ${subdomain} is already taken`) {
      console.error(error)
      throw error
    }
    console.log('app already created', app)
    return
  }

  // add domain to heroku app
  console.log('adding domain', 'post', `/apps/${app.name}/domains`, { body: { hostname: `${app.name}.${domain}`, sni_endpoint: null } })
  let d
  try {
    d = await heroku.post(
      `/apps/${app.name}/domains`,
      { body: { hostname: `${app.name}.${domain}`, sni_endpoint: null } }
    ) 
  } catch (error) {
    console.error(error)
    throw error
  }
  console.log('added domain', d)

  // add CNAME record to namecheap
  const { cname } = d
  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${cloudflare.token}`
    },
    body: JSON.stringify({
      type: 'CNAME',
      name: app.name,
      content: cname,
      ttl: 60
    })
  }

  console.log('adding cname record', `https://api.cloudflare.com/client/v4/zones/${cloudflare.zone}/dns_records`, options)

  try {
    const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${cloudflare.zone}/dns_records`, options)
    const result = await response.json()
    console.log('added cname record', result)
  } catch (error) {
    console.error(error)
    throw error
  }


  core.setOutput('url', `http://${app.name}.${domain}`)
}

run()
