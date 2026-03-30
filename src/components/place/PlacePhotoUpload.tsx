type Props = {
  onUpload: (files: FileList | null) => void;
};

export default function PlacePhotoUpload({ onUpload }: Props) {
  return (
    <section>
      <h3>사진 업로드</h3>
      <input type="file" accept="image/*" multiple onChange={(e) => onUpload(e.target.files)} />
    </section>
  );
}