CREATE TABLE `account_stats` (
	`account_id` integer PRIMARY KEY NOT NULL,
	`main_role` text,
	`champ_stats` text NOT NULL,
	`last20` text NOT NULL,
	`stored_games` integer DEFAULT 0 NOT NULL,
	`lp` text,
	`lp_updated_at` integer DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `app_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `match_players` (
	`account_id` integer NOT NULL,
	`match_id` text NOT NULL,
	`queue` text NOT NULL,
	`ended_at` integer NOT NULL,
	`duration_s` integer NOT NULL,
	`remake` integer NOT NULL,
	`win` integer NOT NULL,
	`champion_id` integer NOT NULL,
	`position` text,
	`kills` integer NOT NULL,
	`deaths` integer NOT NULL,
	`assists` integer NOT NULL,
	`cs` integer NOT NULL,
	`score` real,
	`placement` integer,
	`badge` text,
	`lp_change` integer,
	PRIMARY KEY(`account_id`, `match_id`),
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`match_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `match_players_account_idx` ON `match_players` (`account_id`,`ended_at`);--> statement-breakpoint
CREATE INDEX `match_players_score_idx` ON `match_players` (`score`);--> statement-breakpoint
CREATE TABLE `matches` (
	`match_id` text PRIMARY KEY NOT NULL,
	`queue_id` integer NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer NOT NULL,
	`duration_s` integer NOT NULL,
	`patch` text NOT NULL,
	`remake` integer NOT NULL,
	`winner_team` integer,
	`participants` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `matches_ended_idx` ON `matches` (`ended_at`);--> statement-breakpoint
ALTER TABLE `accounts` ADD `live_game` text;--> statement-breakpoint
ALTER TABLE `accounts` ADD `match_backlog` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `accounts` ADD `backfill_state` text DEFAULT 'todo' NOT NULL;--> statement-breakpoint
ALTER TABLE `accounts` ADD `solo_synced_games` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `accounts` ADD `flex_synced_games` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `accounts` ADD `sync_retry_until` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `accounts` ADD `last_game_at` integer;--> statement-breakpoint
ALTER TABLE `members` ADD `banner_champion_id` integer;--> statement-breakpoint
ALTER TABLE `members` ADD `tagline` text;