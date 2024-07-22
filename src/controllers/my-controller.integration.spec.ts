import {
	describe, it, expect, beforeEach,
	afterEach,
} from 'vitest';
import {type FastifyInstance} from 'fastify';
import supertest from 'supertest';
import {eq} from 'drizzle-orm';
import {type DeepMockProxy, mockDeep} from 'vitest-mock-extended';
import {asValue} from 'awilix';
import {type INotificationService} from '@/services/notifications.port.js';
import {
	type ProductInsert,
	products,
	orders,
	ordersToProducts,
} from '@/db/schema.js';
import {type Database} from '@/db/type.js';
import {buildFastify} from '@/fastify.js';

describe('MyController Integration Tests', () => {
	let fastify: FastifyInstance;
	let database: Database;
	let notificationServiceMock: DeepMockProxy<INotificationService>;

	beforeEach(async () => {
		notificationServiceMock = mockDeep<INotificationService>();

		fastify = await buildFastify();
		fastify.diContainer.register({
			ns: asValue(notificationServiceMock as INotificationService),
		});
		await fastify.ready();
		database = fastify.database;
	});
	afterEach(async () => {
		await fastify.close();
	});

	it('should ship product when available', async () => {
		const client = supertest(fastify.server);
		const allProducts = [
			{
				leadTime: 10, available: 10, type: 'NORMAL', name: 'USB Dongle',
			},
		];
		const orderId = await database.transaction(async tx => {
			const productList = await tx.insert(products).values(allProducts).returning({productId: products.id});
			const [order] = await tx.insert(orders).values([{}]).returning({orderId: orders.id});
			await tx.insert(ordersToProducts).values(productList.map(p => ({orderId: order!.orderId, productId: p.productId})));
			return order!.orderId;
		});

		await client.post(`/orders/${orderId}/processOrder`).expect(200).expect('Content-Type', /application\/json/);

		const resultProduct = await database.query.products.findFirst({where: eq(products.name, 'USB Dongle')});
		expect(resultProduct?.available).toBe(9);
	});

	it('should notify lead time when normal product is NOT available', async () => {
		const client = supertest(fastify.server);
		const allProducts = [
			{
				leadTime: 10, available: 0, type: 'NORMAL', name: 'USB Dongle',
			},
		];
		const orderId = await database.transaction(async tx => {
			const productList = await tx.insert(products).values(allProducts).returning({productId: products.id});
			const [order] = await tx.insert(orders).values([{}]).returning({orderId: orders.id});
			await tx.insert(ordersToProducts).values(productList.map(p => ({orderId: order!.orderId, productId: p.productId})));
			return order!.orderId;
		});

		await client.post(`/orders/${orderId}/processOrder`).expect(200).expect('Content-Type', /application\/json/);

		expect(notificationServiceMock.sendDelayNotification).toHaveBeenCalledWith(10, 'USB Dongle');
	});

	it('should notify lead time when seasonal product (in season) is NOT available', async () => {
		const client = supertest(fastify.server);
		const d = 24 * 60 * 60 * 1000;

		const allProducts = [
			{
				leadTime: 15, available: 0, type: 'SEASONAL', name: 'Watermelon', seasonStartDate: new Date(Date.now() - (2 * d)), seasonEndDate: new Date(Date.now() + (58 * d)),
			}
		];
		const orderId = await database.transaction(async tx => {
			const productList = await tx.insert(products).values(allProducts).returning({productId: products.id});
			const [order] = await tx.insert(orders).values([{}]).returning({orderId: orders.id});
			await tx.insert(ordersToProducts).values(productList.map(p => ({orderId: order!.orderId, productId: p.productId})));
			return order!.orderId;
		});

		await client.post(`/orders/${orderId}/processOrder`).expect(200).expect('Content-Type', /application\/json/);

		expect(notificationServiceMock.sendDelayNotification).toHaveBeenCalledWith(15, 'Watermelon');
	});

	it('should notify out of stock when seasonal product (out of season) is NOT available', async () => {
		const client = supertest(fastify.server);
		const d = 24 * 60 * 60 * 1000;

		const allProducts = [
			{
				leadTime: 13, available: 0, type: 'SEASONAL', name: 'Grapes', seasonStartDate: new Date(Date.now() + (180 * d)), seasonEndDate: new Date(Date.now() + (240 * d)),
			}
		];
		const orderId = await database.transaction(async tx => {
			const productList = await tx.insert(products).values(allProducts).returning({productId: products.id});
			const [order] = await tx.insert(orders).values([{}]).returning({orderId: orders.id});
			await tx.insert(ordersToProducts).values(productList.map(p => ({orderId: order!.orderId, productId: p.productId})));
			return order!.orderId;
		});

		await client.post(`/orders/${orderId}/processOrder`).expect(200).expect('Content-Type', /application\/json/);

		expect(notificationServiceMock.sendOutOfStockNotification).toHaveBeenCalledWith('Grapes');
	});

	it('should notify expiration when expirable product has passed', async () => {
		const client = supertest(fastify.server);
		const d = 24 * 60 * 60 * 1000;

		const allProducts = [
			{
				leadTime: 90, available: 9, type: 'EXPIRABLE', name: 'Milk', expiryDate: new Date(Date.now() - (2 * d)),
			}
		];
		const orderId = await database.transaction(async tx => {
			const productList = await tx.insert(products).values(allProducts).returning({productId: products.id});
			const [order] = await tx.insert(orders).values([{}]).returning({orderId: orders.id});
			await tx.insert(ordersToProducts).values(productList.map(p => ({orderId: order!.orderId, productId: p.productId})));
			return order!.orderId;
		});

		await client.post(`/orders/${orderId}/processOrder`).expect(200).expect('Content-Type', /application\/json/);

		expect(notificationServiceMock.sendExpirationNotification).toHaveBeenCalled();
	});

	it('ProcessOrderShouldReturn', async () => {
		const client = supertest(fastify.server);
		const allProducts = createProducts();
		const orderId = await database.transaction(async tx => {
			const productList = await tx.insert(products).values(allProducts).returning({productId: products.id});
			const [order] = await tx.insert(orders).values([{}]).returning({orderId: orders.id});
			await tx.insert(ordersToProducts).values(productList.map(p => ({orderId: order!.orderId, productId: p.productId})));
			return order!.orderId;
		});

		await client.post(`/orders/${orderId}/processOrder`).expect(200).expect('Content-Type', /application\/json/);

		const resultOrder = await database.query.orders.findFirst({where: eq(orders.id, orderId)});
		expect(resultOrder!.id).toBe(orderId);
	});

	function createProducts(): ProductInsert[] {
		const d = 24 * 60 * 60 * 1000;
		return [
			{
				leadTime: 15, available: 30, type: 'NORMAL', name: 'USB Cable',
			},
			{
				leadTime: 10, available: 0, type: 'NORMAL', name: 'USB Dongle',
			},
			{
				leadTime: 15, available: 30, type: 'EXPIRABLE', name: 'Butter', expiryDate: new Date(Date.now() + (26 * d)),
			},
			{
				leadTime: 90, available: 6, type: 'EXPIRABLE', name: 'Milk', expiryDate: new Date(Date.now() - (2 * d)),
			},
			{
				leadTime: 15, available: 30, type: 'SEASONAL', name: 'Watermelon', seasonStartDate: new Date(Date.now() - (2 * d)), seasonEndDate: new Date(Date.now() + (58 * d)),
			},
			{
				leadTime: 15, available: 30, type: 'SEASONAL', name: 'Grapes', seasonStartDate: new Date(Date.now() + (180 * d)), seasonEndDate: new Date(Date.now() + (240 * d)),
			},
		];
	}
});
