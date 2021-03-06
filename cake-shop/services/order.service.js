const orderModel = require("../models/order.model");
const SqlAdapter = require("moleculer-db-adapter-sequelize");
const DbService = require("moleculer-db");
const {
	NotFound,
	Get,
	Create,
	Delete,
	Update,
	Response,
	BadRequest,
} = require("../helper");
module.exports = {
	name: "orders",
	mixins: [DbService],
	adapter: new SqlAdapter(process.env.MySQL_URI),
	model: orderModel,
	async started() {
		// this.adapter.db.sync({ alter: true });
	},
	actions: {
		list: {
			rest: "GET /",
			//auth: "required",
			async handler(ctx) {
				const listOrders = await this.adapter.find({});
				if (listOrders.length == 0) {
					return Response(ctx, {
						message: "Orders is empty",
						listOrders,
					});
				}
				return Get(ctx, listOrders);
			},
		},
		detail: {
			rest: "GET /:id",
			//auth: "required",
			async handler(ctx) {
				console.log(ctx.meta.user);
				const { id } = ctx.params;
				const listOrders = await this.adapter.findOne({
					where: { id },
				});
				if (!listOrders || listOrders.length == 0) {
					throw NotFound("Orders");
				}
				return Get(ctx, listOrders);
			},
		},
		async getDetail(ctx, order) {
			console.log("id don hang:", ctx.params.order);
			const id = ctx.params.order;
			const data = await this.adapter.findOne({ where: { id } });
			//console.log(data);
			return data;
		},
		addVoucher: {
			rest: "PUT /",
			async handler(ctx) {
				//console.log(ctx.params);
				const { order, voucher } = ctx.params;
				const id = order;
				//console.log(order, voucher);
				let order_v = await this.adapter.findOne({ where: { id } });
				//console.log(order.dataValues);
				//console.log(id, voucher);
				const data = await ctx.call("vouchers.checkValid", {
					ctx,
					order,
					voucher,
				});
				if (data.valid === true) {
					order_v["total"] = order_v.total - data.discount;
					order_v["voucher"] = voucher;
					await this.adapter.updateById(order_v.dataValues.id, {
						$set: order_v.dataValues,
					});
					console.log(data);
					return Update(ctx, order_v);
				} else {
					ctx.meta.$statusCode = 400;
					return { message: data.msg };
				}
			},
		},
		getAllOrderOfUser: {
			rest: "GET /:userId",
			params: {
				userId: "string",
			},
			async handler(ctx) {
				console.log(ctx.params);
				const { userId } = ctx.params;
				const listOrdersByUser = await this.getAllOrderOfUser(userId);
				if (!listOrdersByUser || listOrdersByUser.length == 0) {
					throw NotFound("Orders");
				}
				return Get(ctx, listOrdersByUser);
			},
		},
		create: {
			rest: "POST/",
			params: {
				paymentMethodId: { type: "string", optional: true },
				voucherId: { type: "string", optional: true },
				details: {
					type: "array",
					items: {
						type: "object",
						props: {
							productId: { type: "string" },
							amount: { type: "number", positive: true },
							note: { type: "string", optional: true },
						},
					},
				},
			},
			async handler(ctx) {
				const customerId = ctx.meta.user.userId;
				const { details } = ctx.params;
				const newEnity = ctx.params;
				await this.adapter.insert({ newEnity, customerId });
				const { customer, voucher } = ctx.params;
				//console.log(customer);
				let newOrder = await this.adapter.findOne({
					where: { customerId },
				});
				if (details.length === 0) {
					new Promise((resolve) => {
						resolve(newOrder.id);
					}).then(async (orderId) => {
						await this.adapter.removeById(orderId);
					});
					return NotFound("Details");
				}
				for (let i = 0; i < details.length; i++) {
					details[i]["order"] = newOrder.dataValues.id;
					const body = details[i];
					newOrder["total"] += await ctx.call("order_details.add", {
						body,
					});
					await this.adapter.updateById(newOrder.dataValues.id, {
						$set: newOrder.dataValues,
					});
				}
				const order = newOrder.dataValues.id;
				//check voucher and order
				const data = await ctx.call("vouchers.checkValid", {
					ctx,
					order,
					voucher,
				});
				console.log("data:", data);
				if (data.valid === true) {
					new Promise((resolve) => {
						resolve(
							(newOrder["total"] =
								newOrder.total - data.discount),
							(newOrder["voucherId"] = data.id)
						);
					}).then(async () => {
						await this.adapter.updateById(newOrder.dataValues.id, {
							$set: newOrder.dataValues,
						});
					});
					return Create(ctx, null, newOrder);
				} else {
					ctx.meta.$statusCode = 400;
					return { message: data.msg };
				}
			},
		},
		update: {
			rest: "PUT /:id",
			async handler(ctx) {
				//console.log(ctx.params);
				const { id } = ctx.params;
				const order_old = await this.adapter.findOne({
					where: {
						id,
					},
				});
				console.log(order_old);
				if (order_old === null) {
					return NotFound("order");
				}
				//console.log(update_field);
				// _.forEach(ctx.params, async (key, value) => {
				// 	//console.log(item);
				// 	console.log(key, value);
				// 	await this.adapter.db.query(
				// 		`update orders set ${value} = ? where id=?`,
				// 		{
				// 			replacements: [key, id],
				// 			type: QueryTypes.UPDATE,
				// 		}
				// 	);
				// });
				const field = Object.keys(ctx.params);
				console.log(field);
				if (
					_.includes(field, "status") ||
					_.includes(field, "payment_status")
				) {
					await this.adapter.updateById(id, {
						$set: ctx.params,
					});
					const order_new = await this.adapter.findOne({
						where: {
							id,
						},
					});
					return Update(ctx, order_new);
				} else {
					return BadRequest(
						ctx,
						"Not have permission to update order"
					);
				}
			},
		},
		delete: {
			rest: "DELETE /:id",
			async handler(ctx) {
				const { id } = ctx.params;
				const order = await this.adapter.findOne({
					where: {
						id,
					},
				});
				if (!order) {
					return NotFound("order");
				}
				const temp = await this.adapter.removeById(id);
				console.log(temp);
				return Delete(ctx);
			},
		},
	},
	methods: {
		async getAllOrderOfUser(userId) {
			const listOrder = await this.adapter.find({ where: { userId } });
			// console.log("listDelivery", listDelivery);
			return listOrder;
		},
	},
};
