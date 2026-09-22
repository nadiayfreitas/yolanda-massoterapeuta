# Yolanda Massoterapeuta — PWA v1.2

Aplicativo local-first para celular, tablet e computador.

## Novidades da v1.2
- **Modo Aprender agora usa a mesma interface do Uso Diário**, mas com clientes, agenda, valores e pagamentos fictícios e isolados dos dados reais.
- Ajuda contextual em cada tela do treinamento, com explicações simples sobre o que fazer.
- Botão para reiniciar os dados fictícios e botão para sair do treino.
- **Agenda mensal visual** com todos os dias do mês.
- Cada dia do calendário mostra quando há atendimentos.
- Toque em um dia para ver os horários daquele dia.
- Alternância entre **Mês** e **Semana** para facilitar a leitura em telas menores.
- Botões para mês/semana anterior, próximo período e retorno para **Hoje**.
- É possível iniciar um novo agendamento já no dia selecionado.

## O que já funciona
- Modo Aprender separado dos dados reais.
- Modo Uso Diário.
- Modo Administração protegido por PIN.
- Recuperação do PIN por e-mail + chave de recuperação guardada no e-mail.
- Cadastro de clientes.
- Agenda mensal e semanal e histórico de atendimentos.
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

## Atualização preservando os dados
A v1.2 mantém o mesmo banco local (`yolanda-pwa-db`) e a mesma estrutura dos dados reais. Substituir os arquivos do site pela v1.2 **não apaga clientes, agenda ou configurações já salvos no mesmo navegador/aparelho**.

No GitHub, substitua os arquivos da versão anterior pelos arquivos desta pasta. O `sw.js` usa um novo cache (`yolanda-pwa-v1.2`) para que a atualização do PWA seja carregada.

Depois do deploy, abra o app com internet. Se estiver instalado, feche e abra novamente para permitir que o novo Service Worker assuma o controle.

## PIN inicial
`9186`

Troque em **Administração > Configurações**.

### Recuperação do PIN por e-mail
1. Entre em **Administração > Configurações**.
2. Cadastre o e-mail de recuperação e salve.
3. Clique em **Gerar chave de recuperação**.
4. Use **Criar e-mail com a chave** e envie o rascunho para o e-mail cadastrado.
5. Guarde esse e-mail. Se esquecer o PIN, toque em **Esqueci meu PIN** e informe o e-mail + a chave para criar um novo PIN.

A versão local não envia e-mails automaticamente em segundo plano. O envio automático poderá ser ativado na etapa online/Firebase.

## Google Drive e sincronização entre aparelhos
Esta versão ainda não inclui credenciais Google/Firebase fixas no código. Para sincronização segura entre aparelhos, a próxima etapa é conectar Authentication + Cloud Firestore e usar Google Drive como camada de backup.
