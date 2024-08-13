export class Product {
	quantity: number;
	constructor({quantity}: {quantity: number}) {
		this.quantity = quantity;
	}

	isAvailable() {
		return this.quantity > 0;
	}
}

export class SeasonalProduct extends Product {
	startDate: Date;
	endDate: Date;
	constructor({quantity, startDate, endDate}: {quantity: number; startDate: Date; endDate: Date}) {
		super({quantity});
		this.startDate = startDate;
		this.endDate = endDate;
	}

	isOnSeason(currentDate: Date) {
		return currentDate > this.startDate && currentDate < this.endDate;
	}
}

export class ExpirableProduct extends Product {
	expiryDate: Date;
	constructor({quantity, expiryDate}: {quantity: number; expiryDate: Date}) {
		super({quantity});
		this.expiryDate = expiryDate;
	}

	isExpired(currentDate: Date) {
		return currentDate > this.expiryDate;
	}
}
