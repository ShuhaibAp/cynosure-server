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

  delete(id: Types.ObjectId | string) {
    return this.model.findByIdAndDelete(id).exec();
  }
}
