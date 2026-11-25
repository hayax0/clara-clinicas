import { Database } from './database.js';
import { hashPassword } from './auth.js';
import { email, name } from './validation.js';

function readLine(prompt: string, hidden = false): Promise<string> {
  const input = process.stdin as typeof process.stdin & { setRawMode?: (mode: boolean) => void };
  if (!input.isTTY || typeof input.setRawMode !== 'function') {
    throw new Error('Execute este comando em um terminal interativo.');
  }

  process.stdout.write(prompt);
  input.setRawMode(true);
  input.resume();

  return new Promise((resolve, reject) => {
    let value = '';
    const finish = () => {
      input.off('data', onData);
      input.setRawMode?.(false);
      input.pause();
      process.stdout.write('\n');
    };
    const onData = (chunk: Buffer) => {
      for (const character of chunk.toString('utf8')) {
        if (character === '\u0003') {
          finish();
          reject(new Error('Operação cancelada.'));
          return;
        }
        if (character === '\r' || character === '\n') {
          finish();
          resolve(value);
          return;
        }
        if (character === '\u007f' || character === '\b') {
          value = Array.from(value).slice(0, -1).join('');
          if (!hidden) process.stdout.write('\b \b');
          continue;
        }
        if (character >= ' ') {
          value += character;
          if (!hidden) process.stdout.write(character);
        }
      }
    };
    input.on('data', onData);
  });
}

async function main() {
  const parsedName = name.safeParse(await readLine('Nome do administrador: '));
  if (!parsedName.success) throw new Error('Informe um nome válido.');

  const parsedEmail = email.safeParse(await readLine('E-mail: '));
  if (!parsedEmail.success) throw new Error('Informe um e-mail válido.');

  const password = await readLine('Senha (não será exibida): ', true);
  const confirmation = await readLine('Confirme a senha: ', true);
  if (password.length < 10 || password.length > 128) throw new Error('A senha deve ter entre 10 e 128 caracteres.');
  if (password !== confirmation) throw new Error('As senhas não conferem.');

  const db = new Database();
  try {
    const existing = await db.user.findUnique({ where: { email: parsedEmail.data }, select: { id: true } });
    if (existing) throw new Error('Essa conta já existe; use o comando admin:promote se ela deve administrar a plataforma.');
    await db.user.create({
      data: {
        name: parsedName.data,
        email: parsedEmail.data,
        passwordHash: await hashPassword(password),
        isAdmin: true,
      },
    });
    process.stdout.write('Conta Super Admin criada sem vínculo com clínicas.\n');
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Não foi possível criar a conta Super Admin.'}\n`);
  process.exitCode = 1;
});
