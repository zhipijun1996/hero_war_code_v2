const fs = require('fs');

let code = fs.readFileSync('/server.ts', 'utf8');

const handlersToExtract = [
  'pass_action',
  'pass_defend',
  'end_resolve_attack',
  'end_resolve_attack_counter',
  'end_resolve_counter',
  'pass_shop',
  'finish_resolve',
  'play_card',
  'discard_card',
  'finish_discard',
  'hire_hero'
];

let handlersCode = '  const handlers = {\n';

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

handlersCode += '  };\n';

// Insert handlersCode before io.on('connection')
code = code.replace('  io.on(\'connection\', (socket) => {', handlersCode + '\n  io.on(\'connection\', (socket) => {');

fs.writeFileSync('/server.ts', code);
console.log('Refactoring complete.');
