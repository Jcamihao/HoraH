-- CreateEnum
CREATE TYPE "StatusAgendamento" AS ENUM ('AGENDADO', 'CONCLUIDO', 'FALTOU', 'CANCELADO');

-- CreateEnum
CREATE TYPE "ConfirmacaoAgendamento" AS ENUM ('PENDENTE', 'CONFIRMADO', 'SEM_RESPOSTA');

-- CreateEnum
CREATE TYPE "OrigemAgendamento" AS ENUM ('LINK', 'BOT', 'MANUAL');

-- CreateEnum
CREATE TYPE "CanceladoPor" AS ENUM ('CLIENTE', 'PAINEL', 'AUTOMATICO');

-- CreateTable
CREATE TABLE "clientes" (
    "id" UUID NOT NULL,
    "estabelecimentoId" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "whatsapp" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "clientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agendamentos" (
    "id" UUID NOT NULL,
    "estabelecimentoId" UUID NOT NULL,
    "profissionalId" UUID NOT NULL,
    "servicoId" UUID NOT NULL,
    "clienteId" UUID NOT NULL,
    "inicio" TIMESTAMPTZ(3) NOT NULL,
    "fim" TIMESTAMPTZ(3) NOT NULL,
    "precoCentavos" INTEGER NOT NULL,
    "duracaoMin" INTEGER NOT NULL,
    "status" "StatusAgendamento" NOT NULL DEFAULT 'AGENDADO',
    "confirmacao" "ConfirmacaoAgendamento" NOT NULL DEFAULT 'PENDENTE',
    "origem" "OrigemAgendamento" NOT NULL,
    "token" TEXT NOT NULL,
    "consentimentoEm" TIMESTAMPTZ(3),
    "canceladoEm" TIMESTAMPTZ(3),
    "canceladoPor" "CanceladoPor",
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "agendamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bloqueios" (
    "id" UUID NOT NULL,
    "estabelecimentoId" UUID NOT NULL,
    "profissionalId" UUID NOT NULL,
    "inicio" TIMESTAMPTZ(3) NOT NULL,
    "fim" TIMESTAMPTZ(3) NOT NULL,
    "motivo" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bloqueios_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clientes_id_estabelecimentoId_key" ON "clientes"("id", "estabelecimentoId");

-- CreateIndex
CREATE UNIQUE INDEX "clientes_estabelecimentoId_whatsapp_key" ON "clientes"("estabelecimentoId", "whatsapp");

-- CreateIndex
CREATE UNIQUE INDEX "agendamentos_token_key" ON "agendamentos"("token");

-- CreateIndex
CREATE INDEX "agendamentos_estabelecimentoId_inicio_idx" ON "agendamentos"("estabelecimentoId", "inicio");

-- CreateIndex
CREATE INDEX "agendamentos_profissionalId_inicio_idx" ON "agendamentos"("profissionalId", "inicio");

-- CreateIndex
CREATE INDEX "agendamentos_clienteId_idx" ON "agendamentos"("clienteId");

-- CreateIndex
CREATE INDEX "bloqueios_estabelecimentoId_idx" ON "bloqueios"("estabelecimentoId");

-- CreateIndex
CREATE INDEX "bloqueios_profissionalId_inicio_idx" ON "bloqueios"("profissionalId", "inicio");

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_estabelecimentoId_fkey" FOREIGN KEY ("estabelecimentoId") REFERENCES "estabelecimentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_estabelecimentoId_fkey" FOREIGN KEY ("estabelecimentoId") REFERENCES "estabelecimentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_profissionalId_estabelecimentoId_fkey" FOREIGN KEY ("profissionalId", "estabelecimentoId") REFERENCES "profissionais"("id", "estabelecimentoId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_servicoId_estabelecimentoId_fkey" FOREIGN KEY ("servicoId", "estabelecimentoId") REFERENCES "servicos"("id", "estabelecimentoId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_clienteId_estabelecimentoId_fkey" FOREIGN KEY ("clienteId", "estabelecimentoId") REFERENCES "clientes"("id", "estabelecimentoId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bloqueios" ADD CONSTRAINT "bloqueios_estabelecimentoId_fkey" FOREIGN KEY ("estabelecimentoId") REFERENCES "estabelecimentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bloqueios" ADD CONSTRAINT "bloqueios_profissionalId_estabelecimentoId_fkey" FOREIGN KEY ("profissionalId", "estabelecimentoId") REFERENCES "profissionais"("id", "estabelecimentoId") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Regras que o Prisma não expressa no schema: valem no banco, não só na aplicação.
-- ---------------------------------------------------------------------------

-- Impede conflito de horário: dois agendamentos NÃO cancelados do mesmo profissional nunca se
-- sobrepõem, mesmo com duas marcações simultâneas ou um bug na aplicação. Intervalo [inicio, fim):
-- um atendimento que termina às 10:00 não conflita com outro que começa às 10:00.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "agendamentos"
  ADD CONSTRAINT "agendamentos_sem_sobreposicao_excl"
    EXCLUDE USING gist ("profissionalId" WITH =, tstzrange("inicio", "fim", '[)') WITH &&)
    WHERE ("status" <> 'CANCELADO'),
  ADD CONSTRAINT "agendamentos_intervalo_chk" CHECK ("fim" > "inicio"),
  ADD CONSTRAINT "agendamentos_valores_chk" CHECK ("duracaoMin" BETWEEN 5 AND 1440 AND "precoCentavos" >= 0),
  ADD CONSTRAINT "agendamentos_cancelamento_chk"
    CHECK (("status" = 'CANCELADO') = ("canceladoEm" IS NOT NULL AND "canceladoPor" IS NOT NULL));

ALTER TABLE "bloqueios"
  ADD CONSTRAINT "bloqueios_intervalo_chk" CHECK ("fim" > "inicio");

-- WhatsApp canônico: 55 + DDD + celular de 9 dígitos (ver normalizarWhatsapp em @hora-h/shared).
ALTER TABLE "clientes"
  ADD CONSTRAINT "clientes_whatsapp_formato_chk" CHECK ("whatsapp" ~ '^55[1-9][0-9]9[0-9]{8}$');
