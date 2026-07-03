import { createServer } from 'node:http'
import { pathToFileURL } from 'node:url'

const scriptPath = '/__baseline__/main.js'

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Baseline</title>
<script type="module" src="${scriptPath}"></script>
</head>
<body></body>
</html>
`

const script = `const heading = document.createElement('h1')
heading.textContent = 'Hello world'
document.body.append(heading)
`

export const createBaselineServer = () => {
  return createServer((request, response) => {
    if (request.url === scriptPath) {
      response.writeHead(200, {
        'content-type': 'text/javascript; charset=utf-8',
      })
      response.end(script)
      return
    }
    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
    })
    response.end(html)
  })
}

export const startBaselineServer = async (port: number): Promise<void> => {
  const server = createBaselineServer()
  const stop = (): void => {
    server.close(() => undefined)
  }
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, () => {
      server.off('error', reject)
      console.info(`listening on http://localhost:${port}`)
      resolve()
    })
  })
}

const main = async (): Promise<void> => {
  const port = Number.parseInt(process.env.PORT || '', 10)
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error('PORT must be a positive integer')
  }
  await startBaselineServer(port)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : error)
    process.exitCode = 1
  })
}
