import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model } from 'mongoose';
import {
  PurchaseOrder,
  PurchaseOrderDocument,
} from '../bd/purchase-orders/schemas/purchase-order.schema.js';
import {
  Customer,
  CustomerDocument,
} from '../common/customers/schemas/customer.schema.js';
import { PIPELINE_STATUSES } from '../common/enums/po-status.enum.js';
import { OrderRequestsService } from '../common/order-requests/order-requests.service.js';

/** What a signed-in customer may see: their own orders (matched by email) and requests. */
@Injectable()
export class CustomerPortalService {
  constructor(
    @InjectModel(PurchaseOrder.name)
    private poModel: Model<PurchaseOrderDocument>,
    @InjectModel(Customer.name) private customerModel: Model<CustomerDocument>,
    private requests: OrderRequestsService,
  ) {}

  // Each earlier PO has its own customer record, so "my orders" means every record sharing
  // the login's email.
  private records(email: string) {
    return this.customerModel
      .find({ email: email.toLowerCase() })
      .sort({ updatedAt: -1 })
      .exec();
  }

  async me(email: string) {
    const [latest] = await this.records(email);
    return {
      name: latest?.name ?? '',
      email,
      phone: latest?.phone ?? '',
      address: latest?.address ?? '',
      location: latest?.location ?? '',
    };
  }

  async orders(email: string) {
    const ids = (await this.records(email)).map((c) => c._id);
    const items = await this.poModel
      .find({ customerId: { $in: ids } })
      .sort({ createdAt: -1 })
      .limit(200)
      .exec();
    return {
      stages: PIPELINE_STATUSES,
      items: items.map((po) => ({
        id: po._id.toString(),
        poNumber: po.poNumber,
        serviceType: po.serviceType,
        status: po.status,
        createdAt: po.createdAt,
        updatedAt: po.updatedAt,
      })),
    };
  }

  async order(email: string, id: string) {
    if (!isValidObjectId(id)) throw new NotFoundException('Order not found');
    const ids = (await this.records(email)).map((c) => c._id);
    const po = await this.poModel
      .findOne({ _id: id, customerId: { $in: ids } })
      .exec();
    if (!po) throw new NotFoundException('Order not found');
    return {
      id: po._id.toString(),
      poNumber: po.poNumber,
      serviceType: po.serviceType,
      status: po.status,
      stages: PIPELINE_STATUSES,
      createdAt: po.createdAt,
      updatedAt: po.updatedAt,
      contact: {
        name: po.customerDetails.name,
        phone: po.customerDetails.phone,
        address: po.customerDetails.address,
        location: po.customerDetails.location ?? '',
      },
    };
  }

  requestsFor(email: string) {
    return this.requests.listForEmail(email.toLowerCase());
  }

  async createRequest(email: string, note: string) {
    const [latest] = await this.records(email);
    if (!latest) throw new NotFoundException('Customer record not found');
    return this.requests.create(
      { id: latest._id, name: latest.name, email: latest.email },
      note,
    );
  }
}
