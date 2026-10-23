-- CreateEnum
CREATE TYPE "StatusCobranca" AS ENUM ('PENDENTE', 'PAGA', 'VENCIDA', 'ESTORNADA', 'CANCELADA');

-- AlterTable
ALTER TABLE "estabelecimentos" ADD COLUMN     "emailAgendamentos" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "assinaturas" ADD COLUMN     "asaasCustomerId" TEXT,
ADD COLUMN     "asaasSubscriptionId" TEXT,
ADD COLUMN     "cancelaEm" TIMESTAMPTZ(3),
ADD COLUMN     "faixaContratada" INTEGER,
ADD COLUMN     "faixaSincronizada" INTEGER,
ADD COLUMN     "proximaCobrancaEm" DATE,
ADD COLUMN     "toleranciaFimEm" TIMESTAMPTZ(3),
ADD COLUMN     "ultimaReconciliacaoEm" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "cobrancas" (
    "id" UUID NOT NULL,
    "estabelecimentoId" UUID NOT NULL,
    "asaasPaymentId" TEXT NOT NULL,
    "valorCentavos" INTEGER NOT NULL,
    "vencimento" DATE NOT NULL,
    "status" "StatusCobranca" NOT NULL DEFAULT 'PENDENTE',
    "pagaEm" TIMESTAMPTZ(3),
    "url" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cobrancas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asaas_eventos" (
    "id" UUID NOT NULL,
    "eventoId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "asaasPaymentId" TEXT,
    "estabelecimentoId" UUID,
    "payload" JSONB NOT NULL,
    "recebidoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processadoEm" TIMESTAMPTZ(3),

    CONSTRAINT "asaas_eventos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "avisos_email" (
    "id" UUID NOT NULL,
    "estabelecimentoId" UUID NOT NULL,
    "chave" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "enviadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "avisos_email_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cobrancas_asaasPaymentId_key" ON "cobrancas"("asaasPaymentId");

-- CreateIndex
CREATE INDEX "cobrancas_estabelecimentoId_vencimento_idx" ON "cobrancas"("estabelecimentoId", "vencimento");

-- CreateIndex
CREATE UNIQUE INDEX "asaas_eventos_eventoId_key" ON "asaas_eventos"("eventoId");

-- CreateIndex
CREATE INDEX "asaas_eventos_asaasPaymentId_idx" ON "asaas_eventos"("asaasPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "avisos_email_estabelecimentoId_chave_key" ON "avisos_email"("estabelecimentoId", "chave");

-- CreateIndex
CREATE UNIQUE INDEX "assinaturas_asaasSubscriptionId_key" ON "assinaturas"("asaasSubscriptionId");

-- AddForeignKey
ALTER TABLE "cobrancas" ADD CONSTRAINT "cobrancas_estabelecimentoId_fkey" FOREIGN KEY ("estabelecimentoId") REFERENCES "estabelecimentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avisos_email" ADD CONSTRAINT "avisos_email_estabelecimentoId_fkey" FOREIGN KEY ("estabelecimentoId") REFERENCES "estabelecimentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;



-- ---------------------------------------------------------------------------
-- Regras que o Prisma não expressa no schema: valem no banco, não só na aplicação.
-- ---------------------------------------------------------------------------

ALTER TABLE "assinaturas"
  ADD CONSTRAINT "assinaturas_faixa_chk"
    CHECK (("faixaContratada" IS NULL OR "faixaContratada" BETWEEN 1 AND 3)
       AND ("faixaSincronizada" IS NULL OR "faixaSincronizada" BETWEEN 1 AND 3));

ALTER TABLE "cobrancas"
  ADD CONSTRAINT "cobrancas_valor_chk" CHECK ("valorCentavos" >= 0);
