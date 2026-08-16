import { pgTable, serial, text, timestamp, integer, boolean } from 'drizzle-orm/pg-core';

export const applications = pgTable('applications', {
  id: serial('id').primaryKey(),
  name: text('name'),
  description: text('description'),
  version: text('version'),
  size: text('size'),
  category: text('category'),
  platform: text('platform'),
  developer: text('developer'),
  downloadUrl: text('shrankme_url'),
  imageUrl: text('image_url'),
  devuploadUrl: text('devupload_url'),
  downloads: integer('downloads'),
  views: integer('views'),
  active: boolean('active'),
  published: boolean('published'),
  createdAt: timestamp('created_at', { mode: 'date' }),

});