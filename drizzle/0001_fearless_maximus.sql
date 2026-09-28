ALTER TABLE `saved_plans` ADD `share_token` text;--> statement-breakpoint
CREATE UNIQUE INDEX `saved_plans_share_token_unique` ON `saved_plans` (`share_token`);