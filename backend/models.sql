SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE TABLE image_page_relations;
TRUNCATE TABLE images;
TRUNCATE TABLE pages;
SET FOREIGN_KEY_CHECKS = 1;

ALTER TABLE images DROP COLUMN needs_replacement;
ALTER TABLE images DROP COLUMN is_excluded;
ALTER TABLE images ADD COLUMN status INT NOT NULL DEFAULT 0; 