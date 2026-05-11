import express from 'express'
import dotenv from 'dotenv'


dotenv.config()

const app = express()
const PORT = process.env.PORT || 3000

app.use(express.json())

connectDB()

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'mailora-api' })
})

app.use((err, req, res, next) => {
  console.error(err.stack)
  res.status(500).json({ success: false, message: 'Internal server error' })
})

app.listen(PORT, () => {
  console.log(`mailora-api running on port ${PORT}`)
})