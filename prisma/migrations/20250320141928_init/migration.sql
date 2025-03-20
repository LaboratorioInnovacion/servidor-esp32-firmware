-- CreateTable
CREATE TABLE "Device" (
    "mac" TEXT NOT NULL,
    "name" TEXT,
    "status" TEXT,
    "version" TEXT,
    "lastSeen" TIMESTAMP(3),

    CONSTRAINT "Device_pkey" PRIMARY KEY ("mac")
);

-- CreateTable
CREATE TABLE "Measurement" (
    "id" SERIAL NOT NULL,
    "mac" TEXT NOT NULL,
    "time" TIMESTAMP(3),
    "uptime" INTEGER,

    CONSTRAINT "Measurement_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Measurement" ADD CONSTRAINT "Measurement_mac_fkey" FOREIGN KEY ("mac") REFERENCES "Device"("mac") ON DELETE RESTRICT ON UPDATE CASCADE;
