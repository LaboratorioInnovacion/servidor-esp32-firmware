/*
  Warnings:

  - The primary key for the `Device` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the `Measurement` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[mac]` on the table `Device` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `updatedAt` to the `Device` table without a default value. This is not possible if the table is not empty.
  - Made the column `name` on table `Device` required. This step will fail if there are existing NULL values in that column.
  - Made the column `status` on table `Device` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "Measurement" DROP CONSTRAINT "Measurement_mac_fkey";

-- AlterTable
ALTER TABLE "Device" DROP CONSTRAINT "Device_pkey",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "health" TEXT DEFAULT 'NO RESPONDE',
ADD COLUMN     "id" SERIAL NOT NULL,
ADD COLUMN     "measurements" JSONB,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "name" SET NOT NULL,
ALTER COLUMN "name" SET DEFAULT '',
ALTER COLUMN "status" SET NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'desconocido',
ADD CONSTRAINT "Device_pkey" PRIMARY KEY ("id");

-- DropTable
DROP TABLE "Measurement";

-- CreateTable
CREATE TABLE "DebugLog" (
    "id" SERIAL NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DebugLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Device_mac_key" ON "Device"("mac");
