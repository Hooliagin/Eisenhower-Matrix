-- Deutsche Titel für die Bücherliste (Kopieren / eBay-Suche)
alter table books add column if not exists title_de text;
alter table books add column if not exists no_de_edition boolean not null default false;
comment on column books.title_de is 'Deutscher Titel (zum Kopieren / eBay-Suche)';
comment on column books.no_de_edition is 'true = recherchiert, keine deutsche Ausgabe gefunden';
