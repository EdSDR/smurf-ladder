CREATE TABLE `accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`puuid` text NOT NULL,
	`game_name` text NOT NULL,
	`tag_line` text NOT NULL,
	`owner_id` integer NOT NULL,
	`shared` integer DEFAULT false NOT NULL,
	`level` integer,
	`icon_id` integer,
	`solo_tier` text,
	`solo_rank` text,
	`solo_lp` integer,
	`solo_wins` integer,
	`solo_losses` integer,
	`flex_tier` text,
	`flex_rank` text,
	`flex_lp` integer,
	`flex_wins` integer,
	`flex_losses` integer,
	`solo_bank` real,
	`flex_bank` real,
	`solo_decay_pending` integer DEFAULT false NOT NULL,
	`flex_decay_pending` integer DEFAULT false NOT NULL,
	`in_game_since` integer,
	`refreshed_at` integer DEFAULT 0 NOT NULL,
	`riot_id_checked_at` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_puuid_unique` ON `accounts` (`puuid`);--> statement-breakpoint
CREATE INDEX `accounts_refreshed_idx` ON `accounts` (`refreshed_at`);--> statement-breakpoint
CREATE TABLE `credentials` (
	`account_id` integer PRIMARY KEY NOT NULL,
	`ciphertext` text NOT NULL,
	`iv` text NOT NULL,
	`key_ref` text NOT NULL,
	`wrapped_item_key` text,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `group_key_grants` (
	`member_id` integer NOT NULL,
	`key_version` integer NOT NULL,
	`wrapped_group_key` text NOT NULL,
	`granted_by` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`member_id`, `key_version`),
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `members` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`discord_id` text NOT NULL,
	`name` text,
	`avatar` text,
	`role` text DEFAULT 'member' NOT NULL,
	`status` text DEFAULT 'invited' NOT NULL,
	`public_key` text,
	`wrapped_private_key` text,
	`kdf_salt` text,
	`kdf_iters` integer,
	`wrap_iv` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `members_discord_id_unique` ON `members` (`discord_id`);--> statement-breakpoint
CREATE TABLE `rank_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`queue` text NOT NULL,
	`tier` text NOT NULL,
	`rank` text,
	`lp` integer NOT NULL,
	`wins` integer NOT NULL,
	`losses` integer NOT NULL,
	`taken_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `snapshots_account_idx` ON `rank_snapshots` (`account_id`,`queue`,`taken_at`);--> statement-breakpoint
CREATE TABLE `ranked_games` (
	`account_id` integer NOT NULL,
	`match_id` text NOT NULL,
	`queue` text NOT NULL,
	`ended_at` integer NOT NULL,
	PRIMARY KEY(`account_id`, `match_id`),
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`member_id` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_member_idx` ON `sessions` (`member_id`);--> statement-breakpoint
CREATE TABLE `vault_meta` (
	`id` integer PRIMARY KEY NOT NULL,
	`group_key_version` integer NOT NULL
);
