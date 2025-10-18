import { Schema, SchemaFactory, Prop } from "@nestjs/mongoose";
import mongoose, { Document } from "mongoose";
import { User } from "src/auth/schemas/user.schema";

@Schema({
    versionKey: false,
    collection: 'logauths'
})
export class LogAuth extends Document {

    @Prop({
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: false
    })
    user?: User;

    @Prop({
        type: Boolean,
        required: true
    })
    isSuccessful: boolean;

    @Prop({
        type: Date,
        default: Date.now
    })
    date: Date;

    @Prop({
        type: String,
    })
    ipAddress: string;

    @Prop({
        type: String,
    })
    userAgent: string;

    @Prop({
        type: String,
    })
    reason: string;

}

export const LogAuthSchema = SchemaFactory.createForClass(LogAuth);