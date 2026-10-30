# Motor nativo Scrypt

**Estado: ainda não implementado.**

O motor será desenvolvido em C para ARM64 e precisará:

1. Confirmar os parâmetros exatos do Scrypt exigidos pela pool PEP escolhida.
2. Passar vetores de teste conhecidos antes de conectar à pool.
3. Implementar parsing de jobs Stratum e submissão correta de shares.
4. Contabilizar apenas respostas reais de aceitação/rejeição do servidor.
5. Exportar hashrate medido e contadores reais para o monitor multiworker.

Uma conexão Stratum autorizada, isoladamente, não prova que shares válidas estão sendo calculadas. Não serão apresentados hashrate, shares ou pagamentos simulados como resultados reais.
