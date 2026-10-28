import { IsMongoId, IsOptional } from 'class-validator';
import { IsHttpsImageUrl } from 'src/common/validators/is-https-image-url.validator';

export class CreatePeticionesImagenDto {
  @IsMongoId()
  id_cliente: string;

  @IsOptional()
  @IsHttpsImageUrl({ allowEmpty: false })
  document_image?: string;

  @IsOptional()
  @IsHttpsImageUrl({ allowEmpty: false })
  business_image?: string;

  @IsOptional()
  @IsHttpsImageUrl({ allowEmpty: false })
  house_image?: string;
}
