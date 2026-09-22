# Yolanda Massoterapeuta — PWA v1.3

Aplicativo local-first para celular, tablet e computador.

## Novidades da v1.3
- Backup automático real no Google Drive por meio de um Web App privado do Google Apps Script.
- Após alterações reais no aplicativo, o backup é marcado como pendente e enviado automaticamente quando houver internet e o PWA estiver aberto.
- Se o aparelho estiver offline, o envio fica pendente e é tentado quando a internet voltar.
- Status no topo do aplicativo: backup automático, pendente, enviando ou erro.
- Botões administrativos para **Testar conexão** e **Fazer backup agora**.
- O Google Drive passa a receber automaticamente:
  - `backup-atual.json`, atualizado a cada backup;
  - uma cópia diária `yolanda-backup-AAAA-MM-DD.json`;
  - até 30 cópias diárias recentes.
- O backup automático enviado ao Drive não inclui a chave privada de backup nem as credenciais locais de conexão.
- O backup local em arquivo JSON continua disponível como camada adicional de segurança.

## O que já funciona
- Modo Aprender com a mesma interface do Uso Diário, usando dados fictícios separados.
- Modo Uso Diário.
- Modo Administração protegido por PIN.
- Recuperação do PIN por e-mail + chave de recuperação.
- Cadastro de clientes.
- Agenda mensal e semanal.
- Preço padrão por serviço + alteração do valor somente para um agendamento específico.
- Lembretes internos para confirmação do cliente.
- Registro de pagamento e forma de pagamento.
- Serviços e preços configuráveis.
- Histórico de alterações.
- Funcionamento local/offline usando IndexedDB.
- PWA com manifest e service worker.
- Exportação/importação de backup JSON.
- Backup automático no Google Drive após configuração do Apps Script.

## Atualização preservando os dados
A v1.3 mantém o mesmo banco local (`yolanda-pwa-db`). Substituir os arquivos do site pela v1.3 não foi projetado para apagar clientes, agenda ou configurações já salvos no mesmo navegador/aparelho.

O `sw.js` usa o cache `yolanda-pwa-v1.3`.

## PIN inicial
`9186`

Troque em **Administração > Configurações**.

## Configuração do Google Drive
O PWA não guarda senhas da Conta Google e não precisa colocar credenciais Google dentro do GitHub.

A pasta `google_drive_backend` do pacote completo contém:
- `Code.gs`: código do Web App do Google Apps Script.
- `COMO_CONFIGURAR.md`: instruções para criar a conexão.

**Não publique a chave privada de backup no GitHub.**

Depois de configurado, os arquivos serão criados automaticamente no Drive da conta que implantou o Apps Script:

```text
Yolanda Massoterapeuta/
└── Backups Automáticos/
    ├── backup-atual.json
    ├── yolanda-backup-2026-09-22.json
    └── ...
```

## Importante: backup não é sincronização em tempo real
Esta etapa conecta o **backup automático ao Google Drive**. Ela não transforma o Google Drive no banco principal do aplicativo. A sincronização simultânea entre o celular da Yolanda e o painel administrativo em outro aparelho continua sendo uma etapa separada, idealmente com um banco online próprio.


## Versão 1.4 — fechamento diário 23:59
- Todo dado real continua sendo salvo primeiro no próprio aparelho.
- Se houver internet, as alterações reais também podem ser protegidas automaticamente no Google Drive.
- Foi acrescentado um fechamento diário programado para 23:59 (horário do aparelho).
- Se o aparelho estiver offline às 23:59, o fechamento fica pendente e será enviado quando a internet voltar e o PWA estiver ativo.
- Se o aplicativo estiver totalmente fechado/suspenso pelo sistema operacional, um PWA não consegue garantir que o celular será acordado exatamente às 23:59. Ao abrir novamente, o aplicativo verifica o estado pendente.
- O backup local manual continua disponível como camada adicional de segurança.
