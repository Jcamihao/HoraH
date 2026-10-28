-- CreateEnum
CREATE TYPE "StatusConexaoWhatsapp" AS ENUM ('DESCONECTADA', 'AGUARDANDO_QR', 'CONECTADA');

-- CreateEnum
CREATE TYPE "DirecaoMensagem" AS ENUM ('ENVIADA', 'RECEBIDA');

-- CreateEnum
CREATE TYPE "TipoMensagem" AS ENUM ('CONFIRMACAO', 'LEMBRETE', 'CANCELAMENTO_AUTOMATICO', 'BOT');

-- CreateEnum
CREATE TYPE "StatusMensagem" AS ENUM ('NA_FILA', 'ENVIADA', 'ENTREGUE', 'LIDA', 'FALHOU');

-- AlterTable
ALTER TABLE "agendamentos" ADD COLUMN     "confirmadoEm" TIMESTAMPTZ(3),
ADD COLUMN     "confirmarAte" TIMESTAMPTZ(3),
ADD COLUMN     "lembreteAgendadoPara" TIMESTAMPTZ(3),
ADD COLUMN     "lembreteEntregueEm" TIMESTAMPTZ(3),
ADD COLUMN     "lembreteEnviadoEm" TIMESTAMPTZ(3),
ADD COLUMN     "semEntregaAvisadoEm" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "conexoes_whatsapp" (
    "id" UUID NOT NULL,
    "estabelecimentoId" UUID NOT NULL,
    "status" "StatusConexaoWhatsapp" NOT NULL DEFAULT 'DESCONECTADA',
    "conectadoEm" TIMESTAMPTZ(3),
    "ultimaQuedaEm" TIMESTAMPTZ(3),
    "proximoEnvioEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "conexoes_whatsapp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mensagens_log" (
    "id" UUID NOT NULL,
    "estabelecimentoId" UUID NOT NULL,
    "direcao" "DirecaoMensagem" NOT NULL,
    "tipo" "TipoMensagem" NOT NULL,
    "status" "StatusMensagem" NOT NULL,
    "telefone" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "chave" TEXT,
    "waMensagemId" TEXT,
    "agendamentoId" UUID,
    "enviarApartirDe" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "erro" TEXT,
    "enviadaEm" TIMESTAMPTZ(3),
    "entregueEm" TIMESTAMPTZ(3),
    "lidaEm" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mensagens_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notificacoes" (
    "id" UUID NOT NULL,
    "estabelecimentoId" UUID NOT NULL,
    "tipo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "corpo" TEXT NOT NULL,
    "agendamentoId" UUID,
    "lidaEm" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversas_bot" (
    "id" UUID NOT NULL,
    "estabelecimentoId" UUID NOT NULL,
    "telefone" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "dados" JSONB NOT NULL DEFAULT '{}',
    "atualizadaEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversas_bot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "conexoes_whatsapp_estabelecimentoId_key" ON "conexoes_whatsapp"("estabelecimentoId");

-- CreateIndex
CREATE INDEX "mensagens_log_status_enviarApartirDe_idx" ON "mensagens_log"("status", "enviarApartirDe");

-- CreateIndex
CREATE INDEX "mensagens_log_estabelecimentoId_waMensagemId_idx" ON "mensagens_log"("estabelecimentoId", "waMensagemId");

-- CreateIndex
CREATE INDEX "mensagens_log_estabelecimentoId_telefone_createdAt_idx" ON "mensagens_log"("estabelecimentoId", "telefone", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "mensagens_log_estabelecimentoId_chave_key" ON "mensagens_log"("estabelecimentoId", "chave");

-- CreateIndex
CREATE INDEX "notificacoes_estabelecimentoId_createdAt_idx" ON "notificacoes"("estabelecimentoId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "conversas_bot_estabelecimentoId_telefone_key" ON "conversas_bot"("estabelecimentoId", "telefone");

-- CreateIndex
CREATE INDEX "agendamentos_lembreteAgendadoPara_idx" ON "agendamentos"("lembreteAgendadoPara");

-- CreateIndex
CREATE INDEX "agendamentos_confirmarAte_idx" ON "agendamentos"("confirmarAte");

-- AddForeignKey
ALTER TABLE "conexoes_whatsapp" ADD CONSTRAINT "conexoes_whatsapp_estabelecimentoId_fkey" FOREIGN KEY ("estabelecimentoId") REFERENCES "estabelecimentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensagens_log" ADD CONSTRAINT "mensagens_log_estabelecimentoId_fkey" FOREIGN KEY ("estabelecimentoId") REFERENCES "estabelecimentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificacoes" ADD CONSTRAINT "notificacoes_estabelecimentoId_fkey" FOREIGN KEY ("estabelecimentoId") REFERENCES "estabelecimentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversas_bot" ADD CONSTRAINT "conversas_bot_estabelecimentoId_fkey" FOREIGN KEY ("estabelecimentoId") REFERENCES "estabelecimentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;



-- ---------------------------------------------------------------------------
-- Regras que o Prisma não expressa no schema: valem no banco, não só na aplicação.
-- ---------------------------------------------------------------------------

ALTER TABLE "mensagens_log"
  ADD CONSTRAINT "mensagens_log_telefone_chk" CHECK ("telefone" ~ '^55[1-9][0-9]9[0-9]{8}$'),
  ADD CONSTRAINT "mensagens_log_tentativas_chk" CHECK ("tentativas" >= 0);

ALTER TABLE "conversas_bot"
  ADD CONSTRAINT "conversas_bot_telefone_chk" CHECK ("telefone" ~ '^55[1-9][0-9]9[0-9]{8}$');
