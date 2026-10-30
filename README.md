# PEP Miner Cluster

Projeto experimental para desenvolver um minerador PEP para Android ARM64/Termux e monitorar várias máquinas (workers) em um painel central.

## Estado atual

- [x] Estrutura inicial do projeto
- [x] API de monitoramento multiworker com autenticação por token
- [x] Painel web básico
- [x] Script de preparação do Termux
- [ ] Motor nativo Scrypt ARM64
- [ ] Testes de vetores conhecidos do Scrypt
- [ ] Cliente Stratum e submissão real de shares
- [ ] Integração verificada com uma pool PEP
- [ ] Telemetria real do minerador para o painel

**Importante:** esta primeira versão é a infraestrutura de monitoramento. Ela não minera, não gera hashrate fictício e não simula shares ou pagamentos. O motor de mineração só será considerado funcional depois de produzir shares aceitas pela pool.

## Requisitos

- Android ARM64 com Termux atualizado
- Node.js LTS
- Git
- Para compilar o futuro motor nativo: Clang e CMake

## Instalar no Termux

Clone o repositório:

```bash
pkg update -y
pkg install -y git nodejs-lts
git clone https://github.com/NANDOBRTV/pep-miner-cluster.git
cd pep-miner-cluster
```

Inicie o painel local:

```bash
bash scripts/start-dashboard.sh
```

Abra `http://127.0.0.1:8787` no navegador do próprio celular. O script cria um token local em `~/.config/pep-miner-cluster/token`. Para autorizar o painel, copie o token desse arquivo e cole no campo do dashboard.

## API de monitoramento

- `GET /health`: estado do serviço.
- `GET /api/workers`: lista workers registrados (requer `X-Cluster-Token`).
- `POST /api/workers`: recebe telemetria de um worker (requer `X-Cluster-Token`).

Exemplo de envio de telemetria **somente quando integrada a um minerador real**:

```json
{
  "workerId": "worker1",
  "device": "Android ARM64",
  "status": "mining",
  "hashrateH": 0,
  "accepted": 0,
  "rejected": 0
}
```

Não use os zeros do exemplo como resultado de mineração; são apenas valores de demonstração da estrutura da API.

## Segurança

- Não coloque API keys, senhas de pool, seeds, chaves privadas ou tokens no GitHub.
- Use somente pools e algoritmos compatíveis com o hardware e a documentação oficial.
- O painel deve ficar em rede privada confiável. Não exponha a porta publicamente sem HTTPS, firewall e controles adicionais.
- A mineração contínua pode aquecer e desgastar o aparelho. Comece com poucos threads e monitore a temperatura.

## Licença

MIT. Veja [LICENSE](LICENSE).
