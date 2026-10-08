import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Customer, CustomerDocument } from './schemas/customer.schema.js';

export interface CustomerFields {
  name: string;
  address: string;
  location?: string;
  phone: string;
  email: string;
}

@Injectable()
export class CustomersService {
  constructor(
    @InjectModel(Customer.name) private model: Model<CustomerDocument>,
  ) {}

  create(fields: CustomerFields, createdBy: string) {
    return this.model.create({
      ...fields,
      createdBy: new Types.ObjectId(createdBy),
    });
  }

  update(id: Types.ObjectId | string, fields: Partial<CustomerFields>) {
    return this.model
      .findByIdAndUpdate(id, { $set: fields }, { returnDocument: 'after' })
      .exec();
  }

  findById(id: Types.ObjectId | string) {
    return this.model.findById(id).exec();
  }

  /**
   * Customers with a customer-app login, one entry per person (email) carrying their latest
   * details - the record edited most recently wins. Used for the returning-customer picker.
   */
  async listReturning(q?: string) {
    const term = q?.trim();
    const rx = term
      ? new RegExp(
          term.replace(/[.*+?^${}()|[\]\\]/g, (c) => `\\${c}`),
          'i',
        )
      : null;
    const rows = await this.model
      .aggregate<CustomerDocument>([
        { $match: { activatedAt: { $ne: null } } },
        ...(rx ? [{ $match: { $or: [{ name: rx }, { email: rx }] } }] : []),
        { $sort: { updatedAt: -1 } },
        { $group: { _id: '$email', doc: { $first: '$$ROOT' } } },
        { $replaceRoot: { newRoot: '$doc' } },
        { $sort: { name: 1 } },
        { $limit: 200 },
      ])
      .exec();
    return rows.map((c) => ({
      id: c._id.toString(),
      name: c.name,
      email: c.email,
      phone: c.phone,
      address: c.address,
      location: c.location ?? '',
    }));
  }

  delete(id: Types.ObjectId | string) {
    return this.model.findByIdAndDelete(id).exec();
  }
}
