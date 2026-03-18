const fs = require('fs');

let code = fs.readFileSync('server.ts', 'utf8');

const handlersToExtract = [
  'proceed_phase'
];

let handlersCode = '';

for (const event of handlersToExtract) {
  const regex = new RegExp(`    socket\\.on\\('${event}', \\((.*?)\\) => \\{([\\s\\S]*?)\\n    \\}\\);`);
  const match = code.match(regex);
  if (match) {
    const params = match[1];
    let body = match[2];
    
    // Add socket parameter
    const handlerParams = params ? `socket: any, ${params}` : `socket: any`;
    
    handlersCode += `    ${event}: (${handlerParams}) => {${body}\n    },\n`;
    
    // Replace in code
    const replacement = `    socket.on('${event}', (${params}) => handlers.${event}(socket${params ? ', ' + params : ''}));`;
    code = code.replace(match[0], replacement);
    console.log(`Extracted ${event}`);
  } else {
    console.log(`Could not find handler for ${event}`);
  }
}

// Insert handlersCode into handlers object
code = code.replace('  const handlers = {', '  const handlers = {\n' + handlersCode);

fs.writeFileSync('server.ts', code);
console.log('Refactoring complete.');
