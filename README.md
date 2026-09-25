# Yolanda Massoterapeuta — PWA v2.0

Aplicativo instalável para celular, tablet e computador, com funcionamento offline, sincronização entre aparelhos, backup automático no Google Drive e notificações push de agenda/confirmação.

## Modos

- **Modo Aprender:** dados fictícios e treinamento sem alterar a agenda real.
- **Agenda de Atendimentos:** uso diário simplificado pela massoterapeuta.
- **Administração:** configurações, preços, notificações, sincronização, backup e acompanhamento.

## Novidades consolidadas da v2.0

- sessão única ou pacote, com valor total e valor por sessão;
- pacotes com pagamento total ou por sessão;
- recorrência semanal e duplicação de horário;
- edição de agendamento confirmado; mudança de data/horário exige nova confirmação;
- aviso de conflito de horário usando duração do serviço + intervalo configurável;
- bloqueio de horário, dia ou período (compromisso, almoço, férias etc.);
- presença: Compareceu, Faltou ou Cancelou;
- em faltas de pacote, escolha se a sessão será ou não descontada;
- progresso visual dos pacotes e alerta quando resta apenas uma sessão;
- reposição de sessão de pacote sem aumentar o valor total;
- tela de valores a receber (hoje, próximos 7 dias e pacotes);
- próximo retorno sugerido após comparecimento;
- lista de espera, com aviso quando um horário compatível é liberado;
- pesquisa rápida por nome ou telefone dentro da agenda;
- tela inicial com Próximo atendimento, Hoje, Confirmar amanhã e A receber;
- Agenda rápida com horários livres/ocupados;
- bloqueio contra exclusão definitiva no uso diário: cancelamentos/arquivamentos preservam histórico;
- feriados nacionais e estadual de SP + feriados locais configuráveis;
- notificações push de próximo atendimento e confirmações;
- sincronização real entre aparelhos via Google Apps Script/Drive;
- backup automático e fechamento diário às 23:59.

## Dados e atualização

A atualização preserva o banco local existente. Agendamentos antigos são migrados automaticamente para o formato atual. Não desinstale o PWA antes de confirmar um backup e a sincronização.

## Arquivos do PWA

- `index.html`
- `app.js`
- `styles.css`
- `notifications.js`
- `firebase-config.js`
- `manifest.webmanifest`
- `sw.js`
- `icons/`
