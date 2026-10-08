import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';
import {
  OrderRequest,
  OrderRequestDocument,
  OrderRequestStatus,
} from './order-request.schema.js';

const view = (r: OrderRequestDocument) => ({
  id: r._id.toString(),
  customerId: r.customerId.toString(),
  customerName: r.customerName,
  customerEmail: r.customerEmail,
  note: r.note,
  status: r.status,
  createdAt: r.createdAt,
  handledAt: r.handledAt,
  handledBy: r.handledBy,
  poId: r.poId?.toString() ?? null,
});

@Injectable()
export class OrderRequestsService {
  constructor(
    @InjectModel(OrderRequest.name) private model: Model<OrderRequestDocument>,
  ) {}

  /** One open request at a time per customer, so a double tap can't flood BD. */
  async create(
    customer: { id: Types.ObjectId; name: string; email: string },
    note: string,
  ) {
    const open = await this.model
      .exists({ customerEmail: customer.email, status: 'New' })
      .exec();
    if (open)
      throw new ConflictException(
        'You already have a request waiting. Our team will contact you shortly.',
      );
    const created = await this.model.create({
      customerId: customer.id,
      customerName: customer.name,
      customerEmail: customer.email,
      note,
    });
    return view(created);
  }

  async listForEmail(email: string) {
    const items = await this.model
      .find({ customerEmail: email })
      .sort({ createdAt: -1 })
      .limit(20)
      .exec();
    return items.map(view);
  }

  async list(status?: OrderRequestStatus) {
    const items = await this.model
      .find(status ? { status } : {})
      .sort({ createdAt: -1 })
      .limit(100)
      .exec();
    return items.map(view);
  }

  countNew() {
    return this.model.countDocuments({ status: 'New' }).exec();
  }

  async findOpen(id: string) {
    if (!isValidObjectId(id))
      throw new NotFoundException('Order request not found');
    const request = await this.model.findById(id).exec();
    if (!request) throw new NotFoundException('Order request not found');
    return view(request);
  }

  /** Marks a request handled (once); `poId` is set when BD created a PO from it. */
  async markHandled(id: string, by: string, poId?: Types.ObjectId) {
    if (!isValidObjectId(id))
      throw new NotFoundException('Order request not found');
    const updated = await this.model
      .findOneAndUpdate(
        { _id: id, status: 'New' },
        {
          $set: {
            status: 'Handled',
            handledAt: new Date(),
            handledBy: by,
            ...(poId ? { poId } : {}),
          },
        },
        { returnDocument: 'after' },
      )
      .exec();
    if (!updated) {
      if (!(await this.model.exists({ _id: id }).exec()))
        throw new NotFoundException('Order request not found');
      throw new ConflictException('This request was already handled.');
    }
    return view(updated);
  }
}
