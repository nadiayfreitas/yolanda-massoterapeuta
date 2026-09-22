# Yolanda Massoterapeuta — PWA

Primeira versão funcional do aplicativo local-first para uso em celular, tablet e computador.

## O que já funciona
- Modo Aprender separado dos dados reais.
- Modo Uso Diário.
- Modo Administração protegido por PIN.
- Recuperação do PIN por e-mail + chave de recuperação guardada no e-mail.
- Cadastro de clientes.
- Agenda e histórico de atendimentos.
- Preço padrão por serviço + alteração do valor somente para aquele agendamento.
- Registro no histórico quando o valor do agendamento difere do padrão.
- Lembretes internos para entrar em contato e confirmar o cliente.
- Registro de pagamento e forma de pagamento.
- Serviços e preços configuráveis no painel administrativo.
- Histórico de alterações.
- Funcionamento local/offline usando IndexedDB.
- PWA com manifest e service worker.
- Exportação/importação de backup JSON.
- Rascunho de aviso de backup por e-mail.

## PIN inicial
`9186`

Troque em **Administração > Configurações**.

### Recuperação do PIN por e-mail
1. Entre em **Administração > Configurações**.
2. Cadastre o e-mail de recuperação e salve.
3. Clique em **Gerar chave de recuperação**.
4. Use **Criar e-mail com a chave** e envie o rascunho para o e-mail cadastrado.
5. Guarde esse e-mail. Se esquecer o PIN, toque em **Esqueci meu PIN** e informe o e-mail + a chave para criar um novo PIN.

A chave é armazenada no aplicativo apenas em forma de hash. A versão local não envia e-mails automaticamente em segundo plano; o envio automático poderá ser ativado na etapa online/Firebase.

## Como testar no computador
O Service Worker não funciona corretamente abrindo `index.html` por `file://`.
Use um servidor local.

### Opção com Python
Na pasta do projeto:

```bash
python -m http.server 8080
```

Depois abra:

`http://localhost:8080`

## Como instalar como aplicativo
Abra o endereço do PWA no Chrome/Edge em HTTPS (ou localhost durante testes) e use a opção **Instalar aplicativo** / **Adicionar à tela inicial**.

## Google Drive e sincronização entre aparelhos
Esta versão NÃO inclui credenciais Google/Firebase fixas no código. Isso é intencional.

Para sincronização segura entre aparelhos, a próxima etapa recomendada é:
1. Criar um projeto Firebase.
2. Ativar Authentication e Cloud Firestore.
3. Definir contas/usuários separados para Yolanda e Administração.
4. Aplicar regras de segurança no Firestore.
5. Sincronizar os dados locais com Firestore quando houver internet.
6. Usar Google Drive como camada de backup, não como banco de dados em tempo real.
7. Configurar OAuth para o Drive no ambiente de produção.

Isso permite que um aparelho funcione offline e, ao voltar à internet, sincronize os registros com o outro aparelho.

## Backup por e-mail
O aplicativo cria um rascunho de e-mail com um resumo. Para automação real de envio de e-mail e backup no Drive será necessário um backend seguro, Google Apps Script ou serviço equivalente com autenticação.

## Privacidade
Como o aplicativo pode conter dados pessoais e eventualmente informações relacionadas aos atendimentos, evite armazenar dados desnecessários. Em produção, use HTTPS, autenticação, regras de acesso e backups protegidos.
