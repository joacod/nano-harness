let buffer = Buffer.alloc(0)

process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk])

  while (true) {
    const headerEnd = buffer.indexOf('\r\n\r\n')

    if (headerEnd === -1) {
      return
    }

    const header = buffer.subarray(0, headerEnd).toString('utf8')
    const lengthLine = header.split('\r\n').find((line) => line.toLowerCase().startsWith('content-length:'))
    const length = Number.parseInt(lengthLine.slice('content-length:'.length).trim(), 10)
    const bodyStart = headerEnd + 4
    const bodyEnd = bodyStart + length

    if (buffer.length < bodyEnd) {
      return
    }

    const message = JSON.parse(buffer.subarray(bodyStart, bodyEnd).toString('utf8'))
    buffer = buffer.subarray(bodyEnd)
    handleMessage(message)
  }
})

function handleMessage(message) {
  if (message.id === undefined) {
    return
  }

  if (message.method === 'initialize') {
    respond(message.id, { protocolVersion: '2024-11-05', capabilities: {}, serverInfo: { name: 'fake-mcp', version: '0.0.1' } })
    return
  }

  if (message.method === 'tools/list') {
    respond(message.id, { tools: [{ name: 'search_docs', description: 'Search docs', inputSchema: { type: 'object' } }, { name: 'delete_docs' }] })
    return
  }

  if (message.method === 'resources/list') {
    respond(message.id, { resources: [{ uri: 'docs://live', name: 'Live Docs', mimeType: 'text/markdown' }, { uri: 'docs://blocked', name: 'Blocked' }] })
    return
  }

  if (message.method === 'resources/read') {
    respond(message.id, { contents: [{ uri: message.params.uri, mimeType: 'text/markdown', text: '# Live Docs' }] })
    return
  }

  if (message.method === 'tools/call') {
    respond(message.id, { content: [{ type: 'text', text: `searched:${message.params.arguments.query}` }] })
    return
  }

  respond(message.id, null)
}

function respond(id, result) {
  const body = JSON.stringify({ jsonrpc: '2.0', id, result })
  process.stdout.write(`Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`)
}
