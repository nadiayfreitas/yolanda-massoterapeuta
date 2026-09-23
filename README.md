# Yolanda Massoterapeuta PWA v1.7

Aplicativo PWA para agenda, clientes, atendimentos, pagamentos, lembretes, sincronização entre aparelhos, backup no Google Drive e notificações push.

## Novidades da v1.7

- notificações de próximo atendimento;
- notificações de confirmações do dia seguinte;
- tela Administração → Notificações;
- teste de push por aparelho;
- integração preparada com Firebase Cloud Messaging;
- gatilho do Apps Script verifica a agenda aproximadamente a cada 5 minutos;
- nenhuma notificação real é gerada no Modo Aprender.

## Arquivos adicionais

- `firebase-config.js`: configuração pública do app Web Firebase e chave VAPID pública;
- `notifications.js`: registro do aparelho no Firebase Cloud Messaging;
- `sw.js`: recebe push em segundo plano e abre o PWA ao tocar na notificação.

Leia `GUIA_COMPLETO_DO_ZERO.md` no pacote completo antes de configurar.
