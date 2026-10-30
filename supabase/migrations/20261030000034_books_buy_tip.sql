-- Kauf-Empfehlung pro Buch (neu vs. gebraucht)
alter table books add column if not exists buy_tip text;
comment on column books.buy_tip is 'Kauf-Empfehlung (neu vs. gebraucht, Preis, wo) – von Claude recherchiert';
