import { Database } from './database.js';
import { email } from './validation.js';

async function main() {
  const input = email.safeParse(process.argv[2]);
  if (!input.success) {
    process.stderr.write('Informe o e-mail de uma conta cadastrada.\n');
    process.exitCode = 1;
    return;
  }
  const db = new Database();
  try {
    const result = await db.user.updateMany({ where: { email: input.data }, data: { isAdmin: true } });
    if (!result.count) throw new Error('Cadastre a conta antes de promover.');
    process.stdout.write('Acesso de administrador da plataforma atualizado.\n');
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: Error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
