require('dotenv').config()
const express = require('express')
const bodyParser = require('body-parser')
const mysql = require('mysql')
const Hashids = require('hashids/cjs')
const cors = require('cors')
const app = express()

const pool = mysql.createPool({
  connectionLimit: 10,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_SCHEMA,
})

app.use(express.static('public'))
app.use(cors())
app.use(bodyParser.json())

app.post('/shorten', async (req, res) => {
  if (!validateURL(req.body.url)) {
    res
      .status(400)
      .json({ error: 'Malformed URL' })
      .send()
  }

  const dbId = await saveUrlToDatabase(req.body.url)
  const encoded = encodeId(dbId)

  res.status(200).json({ encoded })
  res.send()
})

app.get('/', express.static('public'))

app.get('/:id', async (req, res) => {
  const decoded = decodeId(req.params.id)
  if (decoded) {
    const longUrl = await getUrlFromDatabase(decoded)
    if (checkForProtocol(longUrl)) res.redirect(longUrl)
    else res.redirect(`http://${longUrl}`)
    res.send()
    return
  }
  res.redirect('/')
})

app.post('/lookup', async (req, res) => {
  const decoded = decodeId(req.body.id)
  if (decoded) {
    await getUrlFromDatabase(decoded)
      .then(longUrl => res.send({ longUrl }))
      .catch(error => {
        const { message } = error
        res.send({ error: message })
      })
    return
  }
  res.status(400).send({ error: 'Could not find ID' })
})

app.listen(3000, () => {
  console.log('Server running on Port 3000')
})

const validateURL = url => {
  const regex = new RegExp(
    /[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9äöü()@:%_\+.~#?&//=]*)/g
  )
  return regex.test(url)
}

const encodeId = id => {
  const hashIds = new Hashids(process.env.SALT, 10)
  const encoded = hashIds.encode(id)
  return encoded
}

const decodeId = id => {
  const hashIds = new Hashids(process.env.SALT, 10)
  const decoded = hashIds.decode(id)
  return decoded[0]
}

const saveUrlToDatabase = url => {
  return new Promise((resolve, reject) => {
    pool.query('INSERT INTO url (longurl) VALUES(?)', url, (error, results) => {
      console.log(url)
      if (error) reject(error)
      resolve(results.insertId)
    })
  })
}

const getUrlFromDatabase = id => {
  return new Promise((resolve, reject) => {
    pool.query(
      `SELECT longurl from url where id = ${id} LIMIT 1`,
      (error, results) => {
        if (error) reject(error)
        if (results.length === 0) {
          reject(new Error('No link with this ID was found'))
          return
        }
        resolve(results[0].longurl)
      }
    )
  })
}

const checkForProtocol = url => {
  const regex = new RegExp('^(http|https)://')
  return regex.test(url)
}
