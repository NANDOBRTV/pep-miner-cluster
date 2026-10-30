# PEP Miner Cluster

Projeto para mineração PEP em Android ARM64/Termux, usando **somente Mining-Dutch SOLO**, com painel de monitoramento multiworker.

## Estado real do projeto

- [x] Estrutura do projeto, API de monitoramento e painel web.
- [x] Diagnóstico TCP/Stratum e autorização do worker na Mining-Dutch a partir do Android.
- [x] Scrypt PEP 1024/1/1/256 validado contra cinco vetores oficiais do Pepecoin Core.
- [x] Montagem do cabeçalho de 80 bytes, coinbase, Merkle root e alvos de share.
- [x] Minerador Stratum V1 multithread com envio de shares e contadores de aceitas/rejeitadas.
- [x] Teste de integração local com pool simulado e reconexão com backoff.
- [ ] Confirmar share aceita pela Mining-Dutch real e validar definitivamente a ordem dos bytes do job.
- [ ] Otimização nativa ARM64 e integração da telemetria real com o painel.

**Transparência:** o código de mineração já existe e passou por testes locais, mas ainda não foi confirmado um share aceito pela pool real. Não considere conexão/autorização ou hashrate local como prova de mineração validada.

## Configuração

O endpoint testado no Android foi:

```
stratum+tcp://brazil.mining-dutch.nl:8888
```

A configuração privada fica em `config/config.json`, ignorada pelo Git. Use o usuário Mining-Dutch no formato `conta.worker1`, e configure a carteira PEP de pagamento no painel da pool. Para o primeiro teste neste aparelho, use `d=1` como senha do worker para solicitar dificuldade de share baixa; a pool pode ajustar esse valor.

Nunca envie nem publique senha da pool, API key, seed phrase ou chave privada.

## Atualizar e testar no Termux

Dentro da pasta do repositório:

```bash
git pull
npm run check
npm run test:pow
npm run test:stratum
```

- `test:pow`: valida os cinco vetores oficiais e os auxiliares de cabeçalho/alvo.
- `test:stratum`: executa um teste local com uma pool simulada; não acessa nem minera na pool real.

## Iniciar uma sessão curta de mineração

Com um monitor de temperatura aberto no Android:

```bash
MINE_THREADS=8 MINE_SECONDS=120 npm run mine
```

O padrão é 120 segundos; cada sessão é limitada a no máximo 600 segundos. Se o Termux conseguir ler sensores térmicos, o minerador para ao atingir 42 °C. Neste aparelho os sensores não apareceram para o Termux, então monitore a temperatura externamente e interrompa a sessão se aquecer demais. Nenhum limite térmico, frequência ou governor do Android é alterado.

O minerador mostra hashes calculados, hashrate medido, shares submetidas, aceitas e rejeitadas. Só conta uma share como aceita quando a Mining-Dutch responde positivamente. Se a conexão cair, tenta reconectar ao mesmo endpoint com espera progressiva.

## Painel

Inicie o painel local em uma sessão do Termux:

```bash
bash scripts/start-dashboard.sh
```

Abra `http://127.0.0.1:8787` no navegador do celular. Mantenha o painel aberto em uma sessão e inicie o minerador em outra; ele lê o token local gerado pelo painel e envia hashrate, shares aceitas/rejeitadas e estado do worker a cada 10 segundos. Para outro dispositivo, configure `dashboard.url` e `PEP_CLUSTER_TOKEN` usando uma rede privada confiável.

## Segurança e limitações

- Use o aparelho em superfície ventilada e monitore a temperatura; mineração contínua pode aquecer e desgastar o telefone.
- Não desative as proteções térmicas do Android.
- Não exponha o painel publicamente sem HTTPS, firewall e autenticação apropriada.
- O minerador atual usa Node/OpenSSL Scrypt; otimização nativa ARM64 ainda está pendente.

## Licença

MIT. Veja [LICENSE](LICENSE).
