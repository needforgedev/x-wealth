CREATE TYPE "public"."instrument_kind" AS ENUM('EQUITY', 'INDEX');--> statement-breakpoint
CREATE TYPE "public"."price_adjustment" AS ENUM('ADJUSTED', 'UNADJUSTED');--> statement-breakpoint
CREATE TABLE "daily_bars" (
	"symbol" text NOT NULL,
	"date" date NOT NULL,
	"open" numeric(18, 4) NOT NULL,
	"high" numeric(18, 4) NOT NULL,
	"low" numeric(18, 4) NOT NULL,
	"close" numeric(18, 4) NOT NULL,
	"volume" bigint NOT NULL,
	"source" text NOT NULL,
	"adjustment" "price_adjustment" NOT NULL,
	"source_vintage" date NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_bars_prices_positive" CHECK ("daily_bars"."open" > 0 and "daily_bars"."high" > 0 and "daily_bars"."low" > 0 and "daily_bars"."close" > 0),
	CONSTRAINT "daily_bars_high_is_highest" CHECK ("daily_bars"."high" >= "daily_bars"."low" and "daily_bars"."high" >= "daily_bars"."open" and "daily_bars"."high" >= "daily_bars"."close"),
	CONSTRAINT "daily_bars_low_is_lowest" CHECK ("daily_bars"."low" <= "daily_bars"."open" and "daily_bars"."low" <= "daily_bars"."close"),
	CONSTRAINT "daily_bars_volume_not_negative" CHECK ("daily_bars"."volume" >= 0)
);
--> statement-breakpoint
CREATE TABLE "instruments" (
	"symbol" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" "instrument_kind" NOT NULL,
	"lot_size" integer NOT NULL,
	"tick_size" numeric(18, 4) NOT NULL,
	"vendor" text NOT NULL,
	"vendor_key" text NOT NULL,
	"isin" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "instruments_symbol_shape" CHECK (symbol ~ '^[A-Z]{2,6}:[A-Z0-9&._-]{1,32}$'),
	CONSTRAINT "instruments_lot_size_positive" CHECK ("instruments"."lot_size" > 0),
	CONSTRAINT "instruments_tick_size_positive" CHECK ("instruments"."tick_size" > 0)
);
--> statement-breakpoint
ALTER TABLE "daily_bars" ADD CONSTRAINT "daily_bars_symbol_instruments_symbol_fk" FOREIGN KEY ("symbol") REFERENCES "public"."instruments"("symbol") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "daily_bars_symbol_date_key" ON "daily_bars" USING btree ("symbol","date");--> statement-breakpoint
CREATE UNIQUE INDEX "instruments_vendor_key_key" ON "instruments" USING btree ("vendor","vendor_key");