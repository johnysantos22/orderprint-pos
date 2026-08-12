// src/data/menu.ts

export type PizzaSize = "M" | "G" | "GG";

export interface Pizza {
  id: number;
  name: string;
  description?: string;
  highlight?: string;
  prices: Record<PizzaSize, number>;
}

export interface MenuItem {
  id: number;
  name: string;
  description?: string;
  price: number;
}

export const pizzas: Pizza[] = [
  {
    id: 1,
    name: "Mussarela",
    description: "(Mussarela, Tomate, Azeitona e Orégano)",
    highlight: "Promoção nas pizzas G e GG: Grátis 1 refrigerante de 1lt",
    prices: { M: 25, G: 35, GG: 45 },
  },
  {
    id: 2,
    name: "Calabresa",
    description: "(Mussarela, Calabresa, Cebola, Azeitona e Orégano)",
    highlight: "Promoção nas pizzas G e GG: Grátis 1 refrigerante de 1lt",
    prices: { M: 25, G: 35, GG: 45 },
  },
  {
    id: 3,
    name: "Napolitano",
    description: "(Mussarela, Calabresa, Presunto, Tomate, Azeitona e Orégano)",
    prices: { M: 30, G: 40, GG: 50 },
  },
  {
    id: 4,
    name: "Quatro Queijo",
    description: "(Mussarela, Requeijão, Queijo Coalho, Cheddar, Tomate, Azeitona e Orégano)",
    prices: { M: 30, G: 40, GG: 50 },
  },
  {
    id: 5,
    name: "Frango Catupiry",
    description: "(Mussarela, Frango, Catupiry, Tomate, Azeitona e Orégano)",
    prices: { M: 30, G: 40, GG: 50 },
  },
  {
    id: 6,
    name: "Frango com Bacon",
    description: "(Mussarela, Bacon, Cebola, Azeitona e Orégano)",
    prices: { M: 30, G: 40, GG: 50 },
  },
  {
    id: 7,
    name: "Sertanejo",
    description: "(Mussarela, Carne de Sol, Queijo Coalho, Cebola, Azeitona e Orégano)",
    prices: { M: 30, G: 40, GG: 50 },
  },
  {
    id: 8,
    name: "Bacon",
    description: "(Mussarela, Bacon, Cebola, Azeitona e Orégano)",
    prices: { M: 30, G: 40, GG: 50 },
  },
  {
    id: 9,
    name: "Baiana",
    description: "(Mussarela, Calabresa Picante, Pimenta, Cebola, Azeitona e Orégano)",
    prices: { M: 30, G: 40, GG: 50 },
  },
  {
    id: 10,
    name: "Portuguesa",
    description: "(Mussarela, Presunto, Ovos, Cebola, Azeitona e Orégano)",
    prices: { M: 30, G: 40, GG: 50 },
  },
  {
    id: 11,
    name: "Quatro Sabores",
    description: "(Mussarela, Sertaneja, Frango e Calabresa)",
    prices: { M: 30, G: 40, GG: 50 },
  },
  {
    id: 12,
    name: "Atum",
    description: "(Mussarela, Atum, Cebola, Azeitona e Orégano)",
    prices: { M: 30, G: 40, GG: 50 },
  },
  {
    id: 13,
    name: "Camarão",
    description: "(Mussarela, Camarão, Cebola, Azeitona e Orégano)",
    prices: { M: 40, G: 50, GG: 60 },
  },
  {
    id: 14,
    name: "Frango com Cheddar",
    description: "(Mussarela, Frango, Cheddar, Tomate, Azeitona e Orégano)",
    prices: { M: 30, G: 40, GG: 50 },
  },
  {
    id: 15,
    name: "Catupireza",
    description: "(Mussarela, Calabresa, Catupiry, Cebola, Tomate, Azeitona e Orégano)",
    prices: { M: 30, G: 40, GG: 50 },
  },
  {
    id: 44,
    name: "Frango",
    description: "(Mussarela, Frango, Tomate, Azeitona e Orégano)",
    prices: { M: 30, G: 40, GG: 50 },
  },
  {
    id: 16,
    name: "Brigadeiro",
    prices: { M: 30, G: 35, GG: 40 },
  },
  {
    id: 17,
    name: "Prestígio",
    prices: { M: 30, G: 35, GG: 40 },
  },
  {
    id: 18,
    name: "Chocolate",
    prices: { M: 30, G: 35, GG: 40 },
  },
];

export const pasteis: MenuItem[] = [
  { id: 19, name: "Carne de Sol", description: "Acompanha Queijo Mussarela", price: 10 },
  { id: 20, name: "Calabresa", description: "Acompanha Queijo Mussarela", price: 10 },
  { id: 21, name: "Pizza", description: "Acompanha Queijo Mussarela", price: 10 },
  { id: 22, name: "Frango com Catupiry", description: "Acompanha Queijo Mussarela", price: 10 },
  { id: 23, name: "Mussarela", description: "Acompanha Queijo Mussarela", price: 10 },
  { id: 24, name: "Quatro Queijo", description: "Acompanha Queijo Mussarela", price: 10 },
  { id: 25, name: "Chocolate", description: "Acompanha Queijo Mussarela", price: 10 },
  {
    id: 26,
    name: "Misto (Presunto e queijo)",
    description: "Acompanha Queijo Mussarela",
    price: 10,
  },
  { id: 27, name: "Frango com Cheddar", description: "Acompanha Queijo Mussarela", price: 10 },
  { id: 45, name: "Frango", description: "Acompanha Queijo Mussarela", price: 10 },
  { id: 46, name: "Camarão", description: "Acompanha Queijo Mussarela", price: 20 },
];

export const porcoes: MenuItem[] = [{ id: 28, name: "Batata frita (G)", price: 20 }];

export const bebidas: MenuItem[] = [
  { id: 29, name: "Água 500ml", price: 3.0 },
  { id: 30, name: "Água com Gás 500ml", price: 3.5 },
  { id: 31, name: "Refrigerante Lata", price: 5.0 },
  { id: 32, name: "Pepsi 1 lt", price: 9.0 },
  { id: 33, name: "Guaraná 1 lt", price: 9.0 },
  { id: 34, name: "Coca-Cola 2 lt", price: 15.0 },
  { id: 35, name: "Pepsi 2 lt", price: 15.0 },
  { id: 36, name: "Guaraná 2 lt", price: 15.0 },
];

export const sucos: MenuItem[] = [
  { id: 37, name: "Acerola", price: 7 },
  { id: 38, name: "Cajá", price: 7 },
  { id: 39, name: "Mangaba", price: 7 },
  { id: 40, name: "Graviola", price: 7 },
  { id: 41, name: "Uva", price: 7 },
  { id: 42, name: "Maracujá", price: 8 },
  { id: 43, name: "Goiaba", price: 7 },
];
