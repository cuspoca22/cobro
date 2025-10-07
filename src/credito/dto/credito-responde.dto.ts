import { Exclude, Expose, Transform } from "class-transformer";

export class CreateCreditoResponseDto {
  @Expose() // Asegura que este campo sea expuesto
  @Transform(({ obj }) => obj._id.toString()) // Convierte ObjectId a string
  id: string;

  @Exclude()
  _id: string;

  @Exclude()
  __v: number;
}