import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

/**
 * The customer's contact details as they were when a PO was created or last edited. Stored on
 * the PO itself so quotations, pickup reports and PDFs keep showing what was true for that
 * order even when the same customer is reused later with a new address.
 */
@Schema({ _id: false })
export class CustomerDetails {
  @Prop({ type: String, required: true, trim: true })
  name!: string;

  @Prop({ type: String, required: true, trim: true })
  address!: string;

  @Prop({ type: String, trim: true, default: '' })
  location!: string;

  @Prop({ type: String, required: true, trim: true })
  phone!: string;

  @Prop({ type: String, required: true, trim: true, lowercase: true })
  email!: string;
}

export const CustomerDetailsSchema =
  SchemaFactory.createForClass(CustomerDetails);
