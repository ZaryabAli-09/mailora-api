import express from 'express'
import dotenv from 'dotenv'
import { errorHandler, notFoundHandler } from './utils/errorMiddleware.js'


dotenv.config()

const app = express()
const PORT = process.env.PORT || 3000

app.use(express.json())

connectDB()

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'mailora-api' })
})

app.all('*', notFoundHandler)
app.use(errorHandler)

app.listen(PORT, () => {
  console.log(`mailora-api running on port ${PORT}`)
})